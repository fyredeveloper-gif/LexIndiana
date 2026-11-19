import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, requireSameOrigin, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { buildOtpAuthUri, generateTotpSecret } from "@/lib/totp";

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthorized();

  try {
    const secret = generateTotpSecret();
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorSecret: secret } });

    const issuer = process.env.TWO_FACTOR_ISSUER ?? "Lex Indiana";
    const otpauthUri = buildOtpAuthUri(secret, user.email, issuer);
    const qrDataUrl = await QRCode.toDataURL(otpauthUri, { margin: 1, width: 260 });

    return NextResponse.json({ secret, otpauthUri, qrDataUrl });
  } catch (error) {
    return handleApiError(error, "Could not start two-factor setup.");
  }
}
