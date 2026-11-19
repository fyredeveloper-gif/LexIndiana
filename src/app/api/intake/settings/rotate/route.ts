import { NextResponse } from "next/server";
import { handleApiError, requireCapability, requireSameOrigin, unauthResponse } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth";
import { generateIntakeToken, intakeUrl } from "@/lib/intake";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "intake:configure");
  if (denied) return denied;

  try {
    const token = generateIntakeToken();
    await prisma.firm.update({
      where: { id: user.firmId },
      data: { intakeToken: token, intakeEnabled: true },
    });

    await recordAudit({
      firmId: user.firmId,
      actorId: user.id,
      action: "intake.token_rotated",
      entityType: "firm",
      entityId: user.firmId,
    });

    return NextResponse.json({ ok: true, token, url: intakeUrl(token) });
  } catch (error) {
    return handleApiError(error, "Could not rotate the intake link.");
  }
}
