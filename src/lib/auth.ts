import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import type { StaffRole } from "@prisma/client";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE = "lex_session";
export const PENDING_2FA_COOKIE = "lex_pending_2fa";
const SESSION_TTL_DAYS = 7;
const PENDING_TTL_SECONDS = 10 * 60;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  indianaAttorneyNumber: string | null;
  defaultHourlyRate: number;
  twoFactorEnabled: boolean;
  firmId: string;
  firmName: string;
  firmAddress: string | null;
  firmPhone: string | null;
  firmEmail: string | null;
  role: StaffRole;
};

const sessionUserSelect = {
  id: true,
  email: true,
  name: true,
  indianaAttorneyNumber: true,
  defaultHourlyRate: true,
  twoFactorEnabled: true,
  memberships: {
    take: 1,
    select: {
      role: true,
      firm: {
        select: { id: true, name: true, address: true, phone: true, email: true },
      },
    },
  },
} as const;

function authSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be configured with at least 32 characters.");
  }
  return new TextEncoder().encode(secret);
}

function cookieIsSecure(): boolean {
  if (process.env.SESSION_COOKIE_SECURE === "true") return true;
  return (process.env.APP_URL ?? "").startsWith("https://");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Issue an opaque session token; only its SHA-256 digest is persisted. */
export async function createSession(userId: string, userAgent?: string | null): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt,
      userAgent: userAgent?.slice(0, 255) ?? null,
    },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieIsSecure(),
    path: "/",
    expires: expiresAt,
  });
}

/** Best-effort cleanup of expired sessions; safe to call on login. */
export async function pruneExpiredSessions(): Promise<void> {
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => undefined);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    select: { id: true, expiresAt: true, user: { select: sessionUserSelect } },
  });

  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  const membership = session.user.memberships[0];
  if (!membership) return null;

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    indianaAttorneyNumber: session.user.indianaAttorneyNumber,
    defaultHourlyRate: Number(session.user.defaultHourlyRate),
    twoFactorEnabled: session.user.twoFactorEnabled,
    firmId: membership.firm.id,
    firmName: membership.firm.name,
    firmAddress: membership.firm.address,
    firmPhone: membership.firm.phone,
    firmEmail: membership.firm.email,
    role: membership.role,
  };
}

/** For server components/layouts: redirects to the login page when signed out. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  }
  store.delete(SESSION_COOKIE);
}

export async function createTwoFactorChallenge(userId: string): Promise<void> {
  const token = await new SignJWT({ purpose: "2fa" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${PENDING_TTL_SECONDS}s`)
    .sign(authSecret());

  const store = await cookies();
  store.set(PENDING_2FA_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieIsSecure(),
    path: "/",
    maxAge: PENDING_TTL_SECONDS,
  });
}

export async function readTwoFactorChallenge(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(PENDING_2FA_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, authSecret());
    if (payload.purpose !== "2fa" || !payload.sub) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

export async function clearTwoFactorChallenge(): Promise<void> {
  const store = await cookies();
  store.delete(PENDING_2FA_COOKIE);
}
