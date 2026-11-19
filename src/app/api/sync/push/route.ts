import { NextResponse } from "next/server";
import { jsonError, parseJsonBody, requireSameOrigin } from "@/lib/api";
import { rawPrisma } from "@/lib/prisma";
import { applyRemoteOperation } from "@/lib/sync/apply";
import { resolveSyncScope } from "@/lib/sync/auth";
import { ENTITY_DELEGATE, isSyncEntity } from "@/lib/sync/entities";
import { parsePayload, payloadUpdatedAt } from "@/lib/sync/payload";

const MAX_OPERATIONS = 200;
const OPERATIONS = new Set(["CREATE", "UPDATE", "DELETE"]);

/**
 * Receives a batch of operations from a peer. Idempotent by operation id, and
 * conflict-safe: if the local row is newer than the incoming edit, the local
 * row is kept and reported back so the sender can record a conflict.
 */
export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const body = (await parseJsonBody(request)) as {
    firmId?: unknown;
    deviceId?: unknown;
    ops?: unknown;
  } | null;

  const scope = await resolveSyncScope(
    request,
    typeof body?.firmId === "string" ? body.firmId : null,
  );
  if (!scope) return jsonError("Sync authentication required.", 401);

  if (!body || !Array.isArray(body.ops)) return jsonError("Expected an ops array.", 422);
  if (body.ops.length > MAX_OPERATIONS) {
    return jsonError(`Send at most ${MAX_OPERATIONS} operations per batch.`, 413);
  }
  const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim().slice(0, 64) : "";
  if (!deviceId) return jsonError("deviceId is required.", 422);

  let applied = 0;
  let skipped = 0;
  const conflicts: Array<{ entity: string; entityId: string; remotePayload: string | null }> = [];

  for (const raw of body.ops) {
    const incoming = raw as {
      id?: unknown;
      entity?: unknown;
      entityId?: unknown;
      operation?: unknown;
      payload?: unknown;
    };

    if (
      typeof incoming.id !== "string" ||
      typeof incoming.entity !== "string" ||
      typeof incoming.entityId !== "string" ||
      typeof incoming.operation !== "string" ||
      !isSyncEntity(incoming.entity) ||
      !OPERATIONS.has(incoming.operation)
    ) {
      skipped += 1;
      continue;
    }

    const alreadyApplied = await rawPrisma.syncOperation.findUnique({
      where: { id: incoming.id },
      select: { id: true },
    });
    if (alreadyApplied) {
      skipped += 1;
      continue;
    }

    const payload = typeof incoming.payload === "string" ? incoming.payload : null;
    const entity = incoming.entity;
    const entityId = incoming.entityId;

    if (incoming.operation !== "DELETE") {
      const delegate = rawPrisma[ENTITY_DELEGATE[entity] as keyof typeof rawPrisma] as unknown as {
        findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
      };
      const current = await delegate.findUnique({ where: { id: entityId } });
      const incomingUpdatedAt = payloadUpdatedAt(parsePayload(payload));
      if (current?.updatedAt && incomingUpdatedAt) {
        const currentUpdatedAt = new Date(current.updatedAt as string | Date);
        if (currentUpdatedAt > incomingUpdatedAt) {
          conflicts.push({
            entity,
            entityId,
            remotePayload: JSON.stringify(current),
          });
          continue;
        }
      }
    }

    const result = await applyRemoteOperation(rawPrisma, {
      firmId: scope.firmId,
      deviceId,
      entity,
      entityId,
      operation: incoming.operation,
      payload,
    });

    if (result.status === "conflict") {
      conflicts.push({ entity, entityId, remotePayload: result.remotePayload ?? null });
      continue;
    }
    if (result.status !== "applied") {
      skipped += 1;
      continue;
    }

    // Insert the feed entry only after a successful apply, with server time so
    // every peer's cursor stays monotonic.
    await rawPrisma.syncOperation.create({
      data: {
        id: incoming.id,
        firmId: scope.firmId,
        deviceId,
        entity,
        entityId,
        operation: incoming.operation,
        payload,
      },
    });
    applied += 1;
  }

  return NextResponse.json({ ok: true, applied, skipped, conflicts });
}
