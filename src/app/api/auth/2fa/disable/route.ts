import { z } from "zod";
import { NextResponse } from "next/server";
import { getSessionUser, verifyPassword } from "@/lib/auth";
import { jsonError, parseJsonBody, requireSameOrigin, unauthResponse, validate } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const schema = z.object({ password: z.string().min(1, "Enter your password.") });

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();

  const parsed = validate(schema, await parseJsonBody(request));
  if (!parsed.ok) return parsed.response;

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!record || !(await verifyPassword(parsed.data.password, record.passwordHash))) {
    return jsonError("Password is incorrect.", 401);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorEnabled: false, twoFactorSecret: null },
  });

  return NextResponse.json({ ok: true });
}
