import { NextResponse } from "next/server";
import {
  jsonError,
  notFound,
  parseJsonBody,
  requireCapability,
  requireSameOrigin,
  unauthResponse,
  validate,
} from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { memberUpdateSchema } from "@/lib/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "members:manage");
  if (denied) return denied;

  const { id } = await params;
  const parsed = validate(memberUpdateSchema, await parseJsonBody(request));
  if (!parsed.ok) return parsed.response;

  const member = await prisma.membership.findFirst({
    where: { id, firmId: user.firmId },
    select: { id: true, userId: true, role: true },
  });
  if (!member) return notFound("Team member not found.");
  if (member.userId === user.id) {
    return jsonError("You cannot change your own role. Transfer ownership instead.", 400);
  }
  if (parsed.data.role === "OWNER") {
    return jsonError("Ownership is transferred, not assigned.", 400);
  }

  const updated = await prisma.membership.update({
    where: { id: member.id },
    data: {
      ...(parsed.data.role !== undefined ? { role: parsed.data.role } : {}),
      ...(parsed.data.title !== undefined ? { title: parsed.data.title || null } : {}),
    },
    select: { role: true, title: true },
  });

  if (parsed.data.role !== undefined && parsed.data.role !== member.role) {
    await recordAudit({
      firmId: user.firmId,
      actorId: user.id,
      action: "member.role_changed",
      entityType: "membership",
      entityId: member.id,
      metadata: { userId: member.userId, from: member.role, to: updated.role },
    });
  }

  return NextResponse.json({ ok: true, role: updated.role, title: updated.title });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "members:manage");
  if (denied) return denied;

  const { id } = await params;
  const member = await prisma.membership.findFirst({
    where: { id, firmId: user.firmId },
    select: { id: true, userId: true, role: true },
  });
  if (!member) return notFound("Team member not found.");
  if (member.userId === user.id) return jsonError("You cannot remove yourself from the firm.", 400);
  if (member.role === "OWNER") return jsonError("Transfer ownership before removing the owner.", 400);

  await prisma.membership.delete({ where: { id: member.id } });
  await recordAudit({
    firmId: user.firmId,
    actorId: user.id,
    action: "member.removed",
    entityType: "membership",
    entityId: member.id,
    metadata: { userId: member.userId, role: member.role },
  });

  return NextResponse.json({ ok: true });
}
