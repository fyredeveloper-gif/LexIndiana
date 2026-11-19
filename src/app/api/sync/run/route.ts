import { NextResponse } from "next/server";
import { jsonError, parseJsonBody, requireSameOrigin } from "@/lib/api";
import { rawPrisma } from "@/lib/prisma";
import { resolveSyncScope } from "@/lib/sync/auth";
import { syncOnce } from "@/lib/sync/engine";
import { syncConfigFromEnv } from "@/lib/sync/transport";

/** Runs one full sync pass immediately (the background worker does this on a timer). */
export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const body = (await parseJsonBody(request)) as { firmId?: unknown } | null;
  const scope = await resolveSyncScope(
    request,
    typeof body?.firmId === "string" ? body.firmId : null,
  );
  if (!scope) return jsonError("Sync authentication required.", 401);

  const config = syncConfigFromEnv();
  if (!config.enabled) {
    return jsonError("Sync is not configured for this installation.", 409);
  }

  const result = await syncOnce(rawPrisma, { firmId: scope.firmId, config });
  return NextResponse.json({ ok: !result.error, ...result }, { status: result.error ? 502 : 200 });
}
