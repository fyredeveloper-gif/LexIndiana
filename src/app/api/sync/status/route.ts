import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { rawPrisma } from "@/lib/prisma";
import { resolveSyncScope } from "@/lib/sync/auth";
import { syncConfigFromEnv } from "@/lib/sync/transport";

/**
 * Local sync state for the UI: whether sync is configured, how many changes are
 * queued, unresolved conflicts, and the last push/pull/error.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const scope = await resolveSyncScope(request, url.searchParams.get("firmId"));
  if (!scope) return jsonError("Sync authentication required.", 401);

  const config = syncConfigFromEnv();
  const cursorId = `${scope.firmId}:${config.deviceId}`;

  const [cursor, pending, conflicts] = await Promise.all([
    rawPrisma.syncCursor.findUnique({ where: { id: cursorId } }),
    rawPrisma.syncOperation.count({
      where: { firmId: scope.firmId, deviceId: config.deviceId, pushedAt: null },
    }),
    rawPrisma.syncConflict.count({ where: { firmId: scope.firmId, status: "OPEN" } }),
  ]);

  return NextResponse.json({
    ok: true,
    firmId: scope.firmId,
    enabled: config.enabled,
    endpoint: config.endpoint || null,
    deviceId: config.deviceId,
    pending,
    conflicts,
    lastPulledAt: cursor?.lastPulledAt?.toISOString() ?? null,
    lastPushedAt: cursor?.lastPushedAt?.toISOString() ?? null,
    lastError: cursor?.lastError ?? null,
  });
}
