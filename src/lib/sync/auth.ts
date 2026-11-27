import { timingSafeEqual } from "node:crypto";
import { getSessionUser, type SessionUser } from "@/lib/auth";

/**
 * Two ways to authenticate a sync call:
 *   1. A signed-in staff session (normal app usage), scoped to their firm.
 *   2. A shared peer secret (desktop <-> demo sync server), where the firm id is
 *      supplied explicitly. The secret is configured on both sides and never
 *      reaches the browser.
 */
export type SyncScope = {
  firmId: string;
  source: "session" | "secret";
  user?: SessionUser;
};

export function hasValidSyncSecret(request: Request): boolean {
  const configured = process.env.SYNC_SECRET ?? "";
  if (configured.length < 16) return false;
  const provided = request.headers.get("x-sync-secret") ?? "";
  const configuredBytes = Buffer.from(configured);
  const providedBytes = Buffer.from(provided);
  if (configuredBytes.length !== providedBytes.length) return false;
  return timingSafeEqual(configuredBytes, providedBytes);
}

/**
 * @param requestedFirmId honoured only for secret-authenticated peers; a session
 *   is always scoped to the user's own firm and can never borrow another.
 */
export async function resolveSyncScope(
  request: Request,
  requestedFirmId?: string | null,
): Promise<SyncScope | null> {
  if (hasValidSyncSecret(request)) {
    const firmId = requestedFirmId?.trim();
    return firmId ? { firmId, source: "secret" } : null;
  }

  const user = await getSessionUser();
  if (!user) return null;
  return { firmId: user.firmId, source: "session", user };
}
