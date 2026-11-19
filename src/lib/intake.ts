import { createHash, randomBytes } from "node:crypto";

const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** 192 bits of entropy, URL-safe. */
export function generateIntakeToken(): string {
  return randomBytes(24).toString("base64url");
}

export function isPlausibleIntakeToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{20,64}$/.test(token);
}

/** Human-readable, non-enumerable reference such as INT-7K4Q2M. */
export function generateIntakeReference(): string {
  const bytes = randomBytes(6);
  let code = "";
  for (const byte of bytes) {
    code += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
  }
  return `INT-${code}`;
}

/** Raw IP addresses are never persisted; only a salted digest for abuse triage. */
export function hashClientIp(ip: string): string {
  const salt = process.env.AUTH_SECRET ?? "development-intake-salt";
  return createHash("sha256").update(`${salt}|${ip}`).digest("hex").slice(0, 32);
}

export function intakeUrl(token: string, base = process.env.APP_URL ?? "http://localhost:3000"): string {
  return `${base.replace(/\/+$/, "")}/request/${token}`;
}

export function buildIntakeMatterTitle(
  name: string,
  practiceArea: string,
  opposingParties: string | null,
): string {
  const firstOpposing = opposingParties
    ?.split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)[0];
  const title = firstOpposing ? `${name} v. ${firstOpposing}` : `${name} — ${practiceArea}`;
  return title.slice(0, 200);
}
