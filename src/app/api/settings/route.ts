import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, parseJsonBody, requireSameOrigin, unauthResponse, validate } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { profileSchema } from "@/lib/validation";

export async function PATCH(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();

  const parsed = validate(profileSchema, await parseJsonBody(request));
  if (!parsed.ok) return parsed.response;

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        name: parsed.data.name,
        indianaAttorneyNumber: parsed.data.indianaAttorneyNumber,
        defaultHourlyRate: parsed.data.defaultHourlyRate,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, "Could not save your profile.");
  }
}
