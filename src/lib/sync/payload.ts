import type { SyncEntity } from "./entities";

/**
 * Passwords and 2FA seeds must never travel through sync. Mirrored accounts get
 * an unusable hash: they can own records and be shown as authors, but cannot be
 * signed in to on a peer.
 */
const USER_SECRET_FIELDS = ["passwordHash", "twoFactorSecret"] as const;
export const SYNCED_USER_PASSWORD_HASH = "!synced-account-no-local-login";

type Row = Record<string, unknown>;

/** JSON text with Dates and Prisma Decimals already stringified by toJSON. */
export function serializePayload(entity: SyncEntity, row: Row): string {
  const clone: Row = { ...row };
  if (entity === "User") {
    for (const field of USER_SECRET_FIELDS) delete clone[field];
  }
  return JSON.stringify(clone);
}

export function parsePayload(value: string | null | undefined): Row | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Row;
  } catch {
    return null;
  }
}

/**
 * Shape a payload for `create`/`update`. Prisma accepts ISO strings for
 * DateTime and string decimals for Decimal on SQLite.
 */
export function prepareForWrite(
  entity: SyncEntity,
  payload: Row,
  mode: "create" | "update",
): Row {
  const data: Row = { ...payload };
  if (entity === "User") {
    delete data.twoFactorSecret;
    delete data.passwordHash;
    if (mode === "create") data.passwordHash = SYNCED_USER_PASSWORD_HASH;
  }
  if (mode === "update") {
    // Never rewrite the primary key; it identifies the row.
    delete data.id;
  }
  return data;
}

/** Client-side rendering of a row's business date, used for conflict ordering. */
export function payloadUpdatedAt(payload: Row | null): Date | null {
  const value = payload?.updatedAt;
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
