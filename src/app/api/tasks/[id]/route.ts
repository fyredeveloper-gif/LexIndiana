import { NextResponse } from "next/server";
import {
  handleApiError,
  jsonError,
  notFound,
  parseJsonBody,
  requireCapability,
  requireSameOrigin,
  unauthResponse,
  validate,
} from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { parseISODate } from "@/lib/dates";
import { matterBelongsToFirm, userBelongsToFirm } from "@/lib/tasks";
import { prisma } from "@/lib/prisma";
import { taskUpdateSchema } from "@/lib/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "task:write");
  if (denied) return denied;

  const { id } = await params;
  const parsed = validate(taskUpdateSchema, await parseJsonBody(request));
  if (!parsed.ok) return parsed.response;

  const body = parsed.data;
  if (body.matterId && !(await matterBelongsToFirm(user.firmId, body.matterId))) {
    return jsonError("Select a matter from your workspace.", 400);
  }
  if (body.assigneeId && !(await userBelongsToFirm(user.firmId, body.assigneeId))) {
    return jsonError("Select a team member from your firm.", 400);
  }

  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined) data.description = body.description || null;
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.matterId !== undefined) data.matterId = body.matterId || null;
  if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId || null;
  if (body.dueDate !== undefined) data.dueDate = body.dueDate ? parseISODate(body.dueDate) : null;
  if (body.completed !== undefined) {
    data.completed = body.completed;
    data.completedAt = body.completed ? new Date() : null;
  }

  try {
    const updated = await prisma.task.updateMany({ where: { id, firmId: user.firmId }, data });
    if (updated.count === 0) return notFound("Task not found.");

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, "Could not update the task.");
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "task:write");
  if (denied) return denied;

  const { id } = await params;
  const deleted = await prisma.task.deleteMany({ where: { id, firmId: user.firmId } });
  if (deleted.count === 0) return notFound("Task not found.");

  return NextResponse.json({ ok: true });
}
