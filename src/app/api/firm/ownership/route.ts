import { NextResponse } from "next/server";
import {
  jsonError,
  parseJsonBody,
  requireCapability,
  requireSameOrigin,
  unauthResponse,
  validate,
} from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { transferOwnershipSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "members:manage");
  if (denied) return denied;

  const parsed = validate(transferOwnershipSchema, await parseJsonBody(request));
  if (!parsed.ok) return parsed.response;
  if (parsed.data.userId === user.id) return jsonError("You are already the owner.", 400);

  const target = await prisma.membership.findFirst({
    where: { firmId: user.firmId, userId: parsed.data.userId },
    select: { id: true, role: true, userId: true },
  });
  if (!target) return jsonError("Select a team member from this firm.", 400);
  if (target.role !== "ATTORNEY") {
    return jsonError("Ownership can only be transferred to an attorney. Change their role first.", 400);
  }

  try {
    await prisma.$transaction([
      prisma.membership.update({
        where: { userId: user.id },
        data: { role: "ATTORNEY" },
      }),
      prisma.membership.update({
        where: { id: target.id },
        data: { role: "OWNER" },
      }),
    ]);

    await recordAudit({
      firmId: user.firmId,
      actorId: user.id,
      action: "ownership.transferred",
      entityType: "membership",
      entityId: target.id,
      metadata: { fromUserId: user.id, toUserId: target.userId, previousRole: target.role },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[ownership]", error);
    return jsonError("Could not transfer ownership.", 500);
  }
}
