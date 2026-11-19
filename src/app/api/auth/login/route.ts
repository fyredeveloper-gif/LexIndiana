import { NextResponse } from "next/server";
import {
  createSession,
  createTwoFactorChallenge,
  pruneExpiredSessions,
  verifyPassword,
} from "@/lib/auth";
import { jsonError, parseJsonBody, requireSameOrigin, validate } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validation";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";

// bcrypt hash of a random value, used to equalize timing when the email is unknown.
const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.O6b8g4r0j3aFqWJ9m0d5G9cD0Q0m9Zu";

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const parsed = validate(loginSchema, await parseJsonBody(request));
  if (!parsed.ok) return parsed.response;

  const { email, password } = parsed.data;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const limitKey = `login:${email}:${forwarded}`;
  const limit = rateLimit(limitKey, 8, 15 * 60 * 1000);
  if (!limit.ok) {
    return jsonError(`Too many attempts. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`, 429);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      passwordHash: true,
      twoFactorEnabled: true,
      twoFactorSecret: true,
      memberships: { select: { id: true } },
    },
  });

  const passwordValid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !passwordValid) {
    return jsonError("Email or password is incorrect.", 401);
  }
  if (user.memberships.length === 0) {
    return jsonError("This account is not attached to a firm. Ask the firm owner for a new invitation.", 403);
  }

  resetRateLimit(limitKey);

  if (user.twoFactorEnabled && user.twoFactorSecret) {
    await createTwoFactorChallenge(user.id);
    return NextResponse.json({ ok: true, requiresTwoFactor: true });
  }

  await pruneExpiredSessions();
  await createSession(user.id, request.headers.get("user-agent"));
  return NextResponse.json({ ok: true, requiresTwoFactor: false });
}
