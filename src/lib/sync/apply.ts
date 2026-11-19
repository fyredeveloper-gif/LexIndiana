import { ENTITY_DELEGATE, isSyncEntity } from "./entities";
import { parsePayload, payloadUpdatedAt, prepareForWrite } from "./payload";

export type ApplyStatus = "applied" | "skipped" | "conflict" | "retry";

export type ApplyResult = {
  status: ApplyStatus;
  reason?: string;
  /** Local payload kept when the remote edit lost, for the conflict record. */
  localPayload?: string | null;
  remotePayload?: string | null;
};

type LooseClient = Record<string, any>;

export type IncomingOperation = {
  firmId: string;
  deviceId: string;
  entity: string;
  entityId: string;
  operation: string;
  payload: string | null;
};

function isForeignKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2003";
}

/**
 * Applies a remote operation to the local database. Callers must pass the
 * unextended `rawPrisma` client so the write is not captured back into the
 * outbox and echoed to the peer.
 *
 * Ordering matters because of foreign keys: when a parent row has not arrived
 * yet the caller must retry later instead of dropping the child, so "retry" is
 * a first-class result.
 */
export async function applyRemoteOperation(
  base: LooseClient,
  op: IncomingOperation,
): Promise<ApplyResult> {
  if (!isSyncEntity(op.entity)) {
    return { status: "skipped", reason: "Entity is not synced." };
  }

  const entity = op.entity;
  const delegate = base[ENTITY_DELEGATE[entity]];

  if (op.operation === "DELETE") {
    try {
      await delegate.deleteMany({ where: { id: op.entityId } });
    } catch (error) {
      if (isForeignKeyError(error)) return { status: "retry", reason: "Referenced by a local record." };
      throw error;
    }
    await base.syncTombstone.upsert({
      where: { firmId_entity_entityId: { firmId: op.firmId, entity, entityId: op.entityId } },
      create: {
        firmId: op.firmId,
        entity,
        entityId: op.entityId,
        deviceId: op.deviceId,
        deletedAt: new Date(),
      },
      update: { deletedAt: new Date(), deviceId: op.deviceId },
    });
    return { status: "applied" };
  }

  const payload = parsePayload(op.payload);
  if (!payload) return { status: "skipped", reason: "Empty payload." };

  const remoteUpdatedAt = payloadUpdatedAt(payload) ?? new Date(0);

  // Never resurrect a record deleted after this edit was made.
  const tombstone = await base.syncTombstone.findUnique({
    where: { firmId_entity_entityId: { firmId: op.firmId, entity, entityId: op.entityId } },
  });
  if (tombstone && new Date(tombstone.deletedAt) > remoteUpdatedAt) {
    return { status: "skipped", reason: "Record was deleted." };
  }

  const local = await delegate.findUnique({ where: { id: op.entityId } });
  if (local?.updatedAt) {
    const localUpdatedAt = new Date(local.updatedAt);
    if (localUpdatedAt > remoteUpdatedAt) {
      const pending = await base.syncOperation.count({
        where: {
          firmId: op.firmId,
          entity,
          entityId: op.entityId,
          pushedAt: null,
        },
      });
      if (pending > 0) {
        return {
          status: "conflict",
          reason: "The local record has newer unsynced changes.",
          localPayload: JSON.stringify(local),
          remotePayload: op.payload,
        };
      }
    }
  }

  try {
    await delegate.upsert({
      where: { id: op.entityId },
      create: { ...prepareForWrite(entity, payload, "create"), id: op.entityId },
      update: prepareForWrite(entity, payload, "update"),
    });
  } catch (error) {
    if (isForeignKeyError(error)) {
      return { status: "retry", reason: "Parent record has not arrived yet." };
    }
    throw error;
  }

  await base.syncTombstone.deleteMany({
    where: { firmId: op.firmId, entity, entityId: op.entityId },
  });

  return { status: "applied" };
}
