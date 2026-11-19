import { NextResponse } from "next/server";
import {
  handleApiError,
  parseJsonBody,
  requireCapability,
  requireSameOrigin,
  unauthResponse,
  validate,
} from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth";
import { generateIntakeToken, intakeUrl } from "@/lib/intake";
import { prisma } from "@/lib/prisma";
import { intakeSettingsSchema } from "@/lib/validation";

export async function PATCH(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "intake:configure");
  if (denied) return denied;

  const parsed = validate(intakeSettingsSchema, await parseJsonBody(request));
  if (!parsed.ok) return parsed.response;

  try {
    const current = await prisma.firm.findUnique({
      where: { id: user.firmId },
      select: { intakeToken: true },
    });

    let token = current?.intakeToken ?? null;
    if (parsed.data.enabled === true && !token) {
      token = generateIntakeToken();
    }

    const updated = await prisma.firm.update({
      where: { id: user.firmId },
      data: {
        ...(parsed.data.enabled !== undefined ? { intakeEnabled: parsed.data.enabled } : {}),
        ...(parsed.data.headline !== undefined ? { intakeHeadline: parsed.data.headline || null } : {}),
        ...(parsed.data.intro !== undefined ? { intakeIntro: parsed.data.intro || null } : {}),
        ...(token && token !== current?.intakeToken ? { intakeToken: token } : {}),
      },
      select: { intakeEnabled: true, intakeToken: true },
    });

    await recordAudit({
      firmId: user.firmId,
      actorId: user.id,
      action: "intake.settings_changed",
      entityType: "firm",
      entityId: user.firmId,
      metadata: {
        enabled: updated.intakeEnabled,
        headlineChanged: parsed.data.headline !== undefined,
        introChanged: parsed.data.intro !== undefined,
      },
    });

    return NextResponse.json({
      ok: true,
      enabled: updated.intakeEnabled,
      token: updated.intakeToken,
      url: updated.intakeToken ? intakeUrl(updated.intakeToken) : null,
    });
  } catch (error) {
    return handleApiError(error, "Could not update the intake settings.");
  }
}
