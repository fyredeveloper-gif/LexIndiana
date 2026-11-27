import { randomUUID } from "node:crypto";
import { applyRemoteOperation } from "./apply";
import { ENTITY_DELEGATE, SYNC_ORDER, type SyncEntity } from "./entities";
import { serializePayload } from "./payload";
import { pullFromPeer, pushToPeer, type SyncConfig } from "./transport";

type LooseClient = Record<string, any>;

export type SyncRunResult = {
  enabled: boolean;
  bootstrapped: boolean;
  pushed: number;
  pulled: number;
  conflicts: number;
  pending: number;
  error?: string;
};

type WireOperation = {
  id: string;
  firmId: string;
  deviceId: string;
  entity: string;
  entityId: string;
  operation: "CREATE" | "UPDATE" | "DELETE";
  payload: string | null;
  createdAt: string;
};

const PUSH_BATCH = 50;
const PULL_LIMIT = 200;
const PULL_PAGES = 20;

function cursorId(firmId: string, deviceId: string): string {
  return `${firmId}:${deviceId}`;
}

async function ensureCursor(base: LooseClient, firmId: string, deviceId: string) {
  return base.syncCursor.upsert({
    where: { id: cursorId(firmId, deviceId) },
    create: { id: cursorId(firmId, deviceId), firmId, deviceId },
    update: {},
  });
}

async function pendingCount(base: LooseClient, firmId: string, deviceId: string): Promise<number> {
  return base.syncOperation.count({ where: { firmId, deviceId, pushedAt: null } });
}

function toWire(row: Record<string, any>): WireOperation {
  return {
    id: row.id,
    firmId: row.firmId,
    deviceId: row.deviceId,
    entity: row.entity,
    entityId: row.entityId,
    operation: row.operation,
    payload: row.payload,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

/** Full snapshot of a firm, parents first, used the first time a peer connects. */
export async function buildBootstrapOps(
  base: LooseClient,
  firmId: string,
  deviceId: string,
): Promise<WireOperation[]> {
  const stamp = new Date().toISOString();
  const ops: WireOperation[] = [];

  for (const entity of SYNC_ORDER) {
    const delegate = base[ENTITY_DELEGATE[entity]];
    const rows: Array<Record<string, any>> =
      entity === "Firm"
        ? await delegate.findMany({ where: { id: firmId } })
        : entity === "User"
          ? await delegate.findMany({ where: { memberships: { some: { firmId } } } })
          : await delegate.findMany({ where: { firmId } });

    for (const row of rows) {
      ops.push({
        id: randomUUID(),
        firmId,
        deviceId,
        entity,
        entityId: row.id,
        operation: "CREATE",
        payload: serializePayload(entity as SyncEntity, row),
        createdAt: stamp,
      });
    }
  }

  return ops;
}

async function pushOperations(
  base: LooseClient,
  firmId: string,
  config: SyncConfig,
  ops: WireOperation[],
): Promise<{ pushed: number; conflicts: number }> {
  let pushed = 0;
  let conflicts = 0;

  for (let index = 0; index < ops.length; index += PUSH_BATCH) {
    const batch = ops.slice(index, index + PUSH_BATCH);
    const response = await pushToPeer(config, {
      firmId,
      deviceId: config.deviceId,
      ops: batch,
    });
    pushed += response.applied;

    for (const conflict of response.conflicts) {
      const source = batch.find(
        (op) => op.entity === conflict.entity && op.entityId === conflict.entityId,
      );
      await base.syncConflict.create({
        data: {
          firmId,
          deviceId: config.deviceId,
          entity: conflict.entity,
          entityId: conflict.entityId,
          localPayload: source?.payload ?? null,
          remotePayload: conflict.remotePayload ?? null,
        },
      });
      conflicts += 1;
    }
  }

  return { pushed, conflicts };
}

async function pullOperations(
  base: LooseClient,
  firmId: string,
  config: SyncConfig,
  since: Date | null,
): Promise<{ pulled: number; conflicts: number; cursor: Date | null }> {
  let cursor = since;
  let pulled = 0;
  let conflicts = 0;

  for (let page = 0; page < PULL_PAGES; page += 1) {
    const response = await pullFromPeer(config, {
      firmId,
      deviceId: config.deviceId,
      since: cursor ? cursor.toISOString() : null,
      limit: PULL_LIMIT,
    });

    if (response.ops.length === 0) break;

    for (const op of response.ops) {
      const result = await applyRemoteOperation(base, op);

      if (result.status === "applied") {
        pulled += 1;
      } else if (result.status === "conflict") {
        conflicts += 1;
        await base.syncConflict.create({
          data: {
            firmId,
            deviceId: config.deviceId,
            entity: op.entity,
            entityId: op.entityId,
            localPayload: result.localPayload ?? null,
            remotePayload: result.remotePayload ?? op.payload,
          },
        });
      } else if (result.status === "retry") {
        // Keep the cursor before this operation so the next pass retries it
        // instead of silently dropping a child whose parent has not arrived.
        throw new Error(`Sync paused: ${result.reason ?? "record could not be applied yet."}`);
      }

      cursor = new Date(op.createdAt);
    }

    if (response.ops.length < PULL_LIMIT) break;
  }

  return { pulled, conflicts, cursor };
}

/**
 * One complete pass: bootstrap (first time), push local changes, pull remote
 * changes. Never throws; failures are reported and stored on the cursor so the
 * status indicator can show them.
 */
export async function syncOnce(
  base: LooseClient,
  options: { firmId: string; config: SyncConfig },
): Promise<SyncRunResult> {
  const { firmId, config } = options;

  if (!config.enabled) {
    return {
      enabled: false,
      bootstrapped: false,
      pushed: 0,
      pulled: 0,
      conflicts: 0,
      pending: await pendingCount(base, firmId, config.deviceId),
    };
  }

  let cursor = await ensureCursor(base, firmId, config.deviceId);
  let bootstrapped = false;
  let pushed = 0;
  let pulled = 0;
  let conflicts = 0;

  try {
    if (!cursor.lastBootstrapAt) {
      const snapshot = await buildBootstrapOps(base, firmId, config.deviceId);
      if (snapshot.length > 0) {
        const result = await pushOperations(base, firmId, config, snapshot);
        pushed += result.pushed;
        conflicts += result.conflicts;
      }
      cursor = await base.syncCursor.update({
        where: { id: cursor.id },
        data: { lastBootstrapAt: new Date() },
      });
      bootstrapped = true;
    }

    const localOps: Array<Record<string, any>> = await base.syncOperation.findMany({
      where: { firmId, deviceId: config.deviceId, pushedAt: null },
      orderBy: { createdAt: "asc" },
      take: 500,
    });

    if (localOps.length > 0) {
      const result = await pushOperations(base, firmId, config, localOps.map(toWire));
      pushed += result.pushed;
      conflicts += result.conflicts;
      await base.syncOperation.updateMany({
        where: { id: { in: localOps.map((op) => op.id) } },
        data: { pushedAt: new Date() },
      });
    }

    const pull = await pullOperations(base, firmId, config, cursor.lastPulledAt ?? null);
    pulled += pull.pulled;
    conflicts += pull.conflicts;

    await base.syncCursor.update({
      where: { id: cursor.id },
      data: {
        lastPushedAt: new Date(),
        ...(pull.cursor ? { lastPulledAt: pull.cursor } : {}),
        lastError: null,
      },
    });

    return {
      enabled: true,
      bootstrapped,
      pushed,
      pulled,
      conflicts,
      pending: await pendingCount(base, firmId, config.deviceId),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed.";
    await base.syncCursor
      .update({ where: { id: cursor.id }, data: { lastError: message } })
      .catch(() => undefined);
    return {
      enabled: true,
      bootstrapped,
      pushed,
      pulled,
      conflicts,
      pending: await pendingCount(base, firmId, config.deviceId).catch(() => 0),
      error: message,
    };
  }
}
