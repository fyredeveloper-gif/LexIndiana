import { ENTITY_DELEGATE, isSyncEntity, type SyncEntity } from "./entities";
import { serializePayload } from "./payload";

export function syncDeviceId(): string {
  return (process.env.LEX_DEVICE_ID || "web").trim() || "web";
}

const WRITE_OPERATIONS = new Set(["create", "update", "upsert", "delete", "deleteMany", "updateMany"]);

// Deliberately loose: the base client is passed structurally so this module has
// no import cycle with src/lib/prisma.ts and works with the generated delegates.
export type SyncCaptureClient = Record<string, any> & {
  syncOperation: { create: (args: any) => Promise<unknown> };
  syncTombstone: {
    upsert: (args: any) => Promise<unknown>;
    deleteMany: (args: any) => Promise<unknown>;
  };
};

type CaptureArgs = {
  base: SyncCaptureClient;
  model: string | undefined;
  operation: string;
  args: Record<string, unknown> | undefined;
  run: (args: unknown) => Promise<unknown>;
};

/**
 * Bookkeeping runs on a serial queue instead of inside the query hook.
 *
 * Prisma's array-form `$transaction([...])` runs the hook while the transaction
 * holds the connection; awaiting an extra query there starves the pool and the
 * transaction times out. Enqueuing keeps the write path fast and preserves
 * operation order across concurrent requests.
 *
 * Remote changes are applied with the unextended client, so they never pass
 * through this hook and cannot echo back to the peer.
 */
let captureQueue: Promise<void> = Promise.resolve();

function enqueue(task: () => Promise<void>): void {
  captureQueue = captureQueue.then(task).catch((error) => {
    console.error("[sync] change capture failed", error);
  });
}

/** Test/smoke helper: resolves once every queued capture has been written. */
export function flushCaptures(): Promise<void> {
  return captureQueue;
}

/**
 * Called by the Prisma extension for every model write. Returns the original
 * query result unchanged; capture failures are logged, never surfaced to the
 * caller, because a sync bookkeeping problem must not break a legal record.
 */
export async function captureMutation({ base, model, operation, args, run }: CaptureArgs): Promise<unknown> {
  if (!model || !isSyncEntity(model) || !WRITE_OPERATIONS.has(operation)) {
    return run(args);
  }

  const entity = model as SyncEntity;

  // A bulk update only returns a count, and the rows may be deleted right
  // afterwards, so snapshot them before the write. None of the app's synced
  // bulk updates run inside a batch transaction.
  if (operation === "updateMany") {
    const rows = await base[ENTITY_DELEGATE[entity]].findMany({ where: args?.where ?? {} });
    const result = await run(args);
    enqueue(async () => {
      for (const row of rows) {
        if (typeof row.firmId === "string") {
          await recordOperation(base, entity, row.id, row.firmId, "UPDATE", row);
        }
      }
    });
    return result;
  }

  const result = await run(args);
  enqueue(() => recordMutation(base, entity, operation, args, result));
  return result;
}

async function recordMutation(
  base: SyncCaptureClient,
  entity: SyncEntity,
  operation: string,
  args: Record<string, unknown> | undefined,
  result: unknown,
): Promise<void> {
  const delegate = base[ENTITY_DELEGATE[entity]];

  if (operation === "deleteMany") {
    // The rows are already gone, so the tombstone needs the firm from the
    // filter. Every synced deleteMany in the app filters by firmId.
    const firmId = (args?.where as { firmId?: unknown } | undefined)?.firmId;
    if (typeof firmId !== "string") return;
    for (const id of idsFromWhere(args?.where)) {
      await recordOperation(base, entity, id, firmId, "DELETE", null);
    }
    return;
  }

  const row = result as Record<string, unknown> | null;
  if (!row || typeof row.id !== "string" || typeof row.firmId !== "string") return;

  if (operation === "delete") {
    await recordOperation(base, entity, row.id, row.firmId, "DELETE", null);
    return;
  }

  // `upsert` is recorded as an update: the receiver always upserts.
  await recordOperation(base, entity, row.id, row.firmId, operation === "create" ? "CREATE" : "UPDATE", row);
}

/** Primary keys named in a `deleteMany` filter (single id or `{ in: [...] }`). */
function idsFromWhere(where: unknown): string[] {
  if (!where || typeof where !== "object") return [];
  const id = (where as { id?: unknown }).id;
  if (typeof id === "string") return [id];
  if (id && typeof id === "object") {
    const values = (id as { in?: unknown }).in;
    if (Array.isArray(values)) return values.filter((value): value is string => typeof value === "string");
  }
  return [];
}

async function recordOperation(
  base: SyncCaptureClient,
  entity: SyncEntity,
  entityId: string,
  firmId: string,
  operation: "CREATE" | "UPDATE" | "DELETE",
  row: Record<string, unknown> | null,
): Promise<void> {
  await base.syncOperation.create({
    data: {
      firmId,
      deviceId: syncDeviceId(),
      entity,
      entityId,
      operation,
      payload: row ? serializePayload(entity, row) : null,
      baseUpdatedAt: row && row.updatedAt instanceof Date ? row.updatedAt : null,
    },
  });

  if (operation === "DELETE") {
    await base.syncTombstone.upsert({
      where: { firmId_entity_entityId: { firmId, entity, entityId } },
      create: { firmId, entity, entityId, deviceId: syncDeviceId(), deletedAt: new Date() },
      update: { deletedAt: new Date(), deviceId: syncDeviceId() },
    });
  } else {
    // A re-created row supersedes an older tombstone.
    await base.syncTombstone.deleteMany({ where: { firmId, entity, entityId } });
  }
}
