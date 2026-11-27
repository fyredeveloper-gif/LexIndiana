import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { rawPrisma } from "@/lib/prisma";
import { resolveSyncScope } from "@/lib/sync/auth";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

/**
 * Returns operations created by other devices, oldest first. The cursor is the
 * newest `createdAt` returned; clients pass it back as `since`.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const scope = await resolveSyncScope(request, url.searchParams.get("firmId"));
  if (!scope) return jsonError("Sync authentication required.", 401);

  const deviceId = (url.searchParams.get("deviceId") ?? "").trim().slice(0, 64);
  if (!deviceId) return jsonError("deviceId is required.", 422);

  const sinceParam = url.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : null;
  if (since && Number.isNaN(since.getTime())) {
    return jsonError("since must be an ISO timestamp.", 422);
  }

  const requestedLimit = Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit =
    Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(Math.floor(requestedLimit), MAX_LIMIT)
      : DEFAULT_LIMIT;

  const ops = await rawPrisma.syncOperation.findMany({
    where: {
      firmId: scope.firmId,
      // A device never pulls its own changes; it already applied them locally.
      deviceId: { not: deviceId },
      ...(since ? { createdAt: { gt: since } } : {}),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit,
  });

  return NextResponse.json({
    ok: true,
    ops: ops.map((op) => ({
      id: op.id,
      firmId: op.firmId,
      deviceId: op.deviceId,
      entity: op.entity,
      entityId: op.entityId,
      operation: op.operation,
      payload: op.payload,
      createdAt: op.createdAt.toISOString(),
    })),
    cursor: ops.at(-1)?.createdAt.toISOString() ?? sinceParam ?? null,
  });
}
