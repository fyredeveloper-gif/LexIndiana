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
import { intakeUpdateSchema } from "@/lib/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const canTriage = requireCapability(user.role, "intake:triage");
  if (canTriage) return canTriage;

  const { id } = await params;
  const parsed = validate(intakeUpdateSchema, await parseJsonBody(request));
  if (!parsed.ok) return parsed.response;

  const submission = await prisma.intakeSubmission.findFirst({
    where: { id, firmId: user.firmId },
    select: {
      id: true,
      status: true,
      assignedToId: true,
      internalNote: true,
      reference: true,
      conflictStatus: true,
    },
  });
  if (!submission) return notFound("Intake submission not found.");

  const { status, assignedToId, internalNote } = parsed.data;

  if (status && (status === "CONVERTED" || status === "DECLINED")) {
    const denied = requireCapability(user.role, "intake:decide");
    if (denied) return denied;
  }

  if (assignedToId !== undefined && assignedToId) {
    const membership = await prisma.membership.findFirst({
      where: { firmId: user.firmId, userId: assignedToId },
      select: { userId: true },
    });
    if (!membership) return jsonError("Select a staff member from this firm.", 400);
  }

  const data: {
    status?: "NEW" | "CONTACTED" | "CONVERTED" | "DECLINED";
    assignedToId?: string | null;
    internalNote?: string | null;
  } = {};
  if (status !== undefined) data.status = status;
  if (assignedToId !== undefined) data.assignedToId = assignedToId || null;
  if (internalNote !== undefined) data.internalNote = internalNote || null;

  await prisma.intakeSubmission.update({
    where: { id: submission.id },
    data,
  });

  if (status !== undefined && status !== submission.status) {
    await recordAudit({
      firmId: user.firmId,
      actorId: user.id,
      action: "intake.status_changed",
      entityType: "intakeSubmission",
      entityId: submission.id,
      metadata: { reference: submission.reference, from: submission.status, to: status },
    });
    if (
      submission.conflictStatus === "REVIEW" &&
      (status === "CONVERTED" || status === "DECLINED")
    ) {
      await recordAudit({
        firmId: user.firmId,
        actorId: user.id,
        action: "conflict.reviewed",
        entityType: "intakeSubmission",
        entityId: submission.id,
        metadata: { reference: submission.reference, decision: status },
      });
    }
  }
  if (assignedToId !== undefined) {
    await recordAudit({
      firmId: user.firmId,
      actorId: user.id,
      action: "intake.assigned",
      entityType: "intakeSubmission",
      entityId: submission.id,
      metadata: { reference: submission.reference, from: submission.assignedToId, to: assignedToId || null },
    });
  }
  if (internalNote !== undefined && internalNote !== submission.internalNote) {
    await recordAudit({
      firmId: user.firmId,
      actorId: user.id,
      action: "intake.note_updated",
      entityType: "intakeSubmission",
      entityId: submission.id,
      metadata: { reference: submission.reference },
    });
  }

  return NextResponse.json({
    ok: true,
    status: status ?? submission.status,
    assignedToId: assignedToId !== undefined ? assignedToId || null : submission.assignedToId,
  });
}
