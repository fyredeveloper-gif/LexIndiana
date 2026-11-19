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
import { matterAccessSchema } from "@/lib/validation";

async function context(userId: string, firmId: string, matterId: string) {
  const [matter, user] = await Promise.all([
    prisma.matter.findFirst({ where: { id: matterId, firmId }, select: { id: true } }),
    prisma.membership.findFirst({
      where: { firmId, userId },
      select: { userId: true, role: true },
    }),
  ]);
  return { matter, user };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const session = await getSessionUser();
  if (!session) return unauthResponse();
  const denied = requireCapability(session.role, "consultant:share");
  if (denied) return denied;

  const { id } = await params;
  const parsed = validate(matterAccessSchema, await parseJsonBody(request));
  if (!parsed.ok) return parsed.response;

  const { matter, user } = await context(parsed.data.userId, session.firmId, id);
  if (!matter) return notFound("Matter not found.");
  if (!user || user.role !== "CONSULTANT") {
    return jsonError("Select a consultant on this firm.", 400);
  }

  await prisma.matterAccess.upsert({
    where: { matterId_userId: { matterId: matter.id, userId: user.userId } },
    create: { matterId: matter.id, userId: user.userId, grantedById: session.id },
    update: { grantedById: session.id },
  });
  await recordAudit({
    firmId: session.firmId,
    actorId: session.id,
    action: "matter.access_granted",
    entityType: "matter",
    entityId: matter.id,
    metadata: { consultantId: user.userId },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const session = await getSessionUser();
  if (!session) return unauthResponse();
  const denied = requireCapability(session.role, "consultant:share");
  if (denied) return denied;

  const { id } = await params;
  const consultantId = new URL(request.url).searchParams.get("userId");
  if (!consultantId) return jsonError("userId is required.", 400);

  const deleted = await prisma.matterAccess.deleteMany({
    where: { matterId: id, userId: consultantId, matter: { firmId: session.firmId } },
  });
  if (deleted.count === 0) return notFound("Access grant not found.");

  await recordAudit({
    firmId: session.firmId,
    actorId: session.id,
    action: "matter.access_revoked",
    entityType: "matter",
    entityId: id,
    metadata: { consultantId },
  });

  return NextResponse.json({ ok: true });
}
