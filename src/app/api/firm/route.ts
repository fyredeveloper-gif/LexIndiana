import { NextResponse } from "next/server";
import {
  handleApiError,
  parseJsonBody,
  requireCapability,
  requireSameOrigin,
  unauthResponse,
  validate,
} from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { firmProfileSchema } from "@/lib/validation";

export async function PATCH(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "firm:profile");
  if (denied) return denied;

  const parsed = validate(firmProfileSchema, await parseJsonBody(request));
  if (!parsed.ok) return parsed.response;

  try {
    await prisma.firm.update({
      where: { id: user.firmId },
      data: {
        name: parsed.data.name,
        address: parsed.data.address,
        phone: parsed.data.phone,
        email: parsed.data.email,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, "Could not save the firm profile.");
  }
}
