import { NextResponse } from "next/server";
import {
  clearTwoFactorChallenge,
  createSession,
  pruneExpiredSessions,
  readTwoFactorChallenge,
} from "@/lib/auth";
import { jsonError, parseJsonBody, requireSameOrigin, validate } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { verifyTotpToken } from "@/lib/totp";
import { twoFactorCodeSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const parsed = validate(twoFactorCodeSchema, await parseJsonBody(request));
  if (!parsed.ok) return parsed.response;

  const userId = await readTwoFactorChallenge();
  if (!userId) {
    return jsonError("Your verification window expired. Sign in again.", 401);
  }

  const limit = rateLimit(`2fa:${userId}`, 10, 10 * 60 * 1000);
  if (!limit.ok) {
    return jsonError("Too many codes entered. Sign in again in a few minutes.", 429);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      twoFactorEnabled: true,
      twoFactorSecret: true,
      memberships: { select: { id: true } },
    },
  });

  if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
    return jsonError("Two-factor authentication is not enabled for this account.", 400);
  }
  if (user.memberships.length === 0) {
    return jsonError("This account is not attached to a firm. Ask the firm owner for a new invitation.", 403);
  }

  if (!verifyTotpToken(user.twoFactorSecret, parsed.data.code)) {
    return jsonError("That code is not valid. Check your authenticator app and try again.", 401);
  }

  await clearTwoFactorChallenge();
  await pruneExpiredSessions();
  await createSession(user.id, request.headers.get("user-agent"));
  return NextResponse.json({ ok: true });
}
