import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { jsonError, parseJsonBody, requireSameOrigin, unauthResponse, validate } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { verifyTotpToken } from "@/lib/totp";
import { twoFactorCodeSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();

  const parsed = validate(twoFactorCodeSchema, await parseJsonBody(request));
  if (!parsed.ok) return parsed.response;

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { twoFactorSecret: true },
  });

  if (!record?.twoFactorSecret) {
    return jsonError("Start two-factor setup before verifying a code.", 400);
  }
  if (!verifyTotpToken(record.twoFactorSecret, parsed.data.code)) {
    return jsonError("That code is not valid. Check your authenticator app and try again.", 400);
  }

  await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });
  return NextResponse.json({ ok: true });
}
