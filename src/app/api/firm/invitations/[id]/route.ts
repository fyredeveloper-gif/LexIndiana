import { NextResponse } from "next/server";
import { notFound, requireCapability, requireSameOrigin, unauthResponse } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "members:manage");
  if (denied) return denied;

  const { id } = await params;
  const invitation = await prisma.invitation.findFirst({
    where: { id, firmId: user.firmId, acceptedAt: null },
    select: { id: true, email: true, role: true },
  });
  if (!invitation) return notFound("Invitation not found.");

  await prisma.invitation.delete({ where: { id: invitation.id } });
  await recordAudit({
    firmId: user.firmId,
    actorId: user.id,
    action: "member.removed",
    entityType: "invitation",
    entityId: invitation.id,
    metadata: { email: invitation.email, role: invitation.role, revoked: true },
  });

  return NextResponse.json({ ok: true });
}
