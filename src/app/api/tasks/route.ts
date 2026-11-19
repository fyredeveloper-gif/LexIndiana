import { NextResponse } from "next/server";
import {
  handleApiError,
  jsonError,
  parseJsonBody,
  requireCapability,
  requireSameOrigin,
  unauthResponse,
  validate,
} from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { parseISODate } from "@/lib/dates";
import { getTasks, matterBelongsToFirm, userBelongsToFirm } from "@/lib/tasks";
import { prisma } from "@/lib/prisma";
import { taskSchema } from "@/lib/validation";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "task:read");
  if (denied) return denied;

  const tasks = await getTasks(user, { includeCompleted: true });
  return NextResponse.json({ tasks });
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "task:write");
  if (denied) return denied;

  const parsed = validate(taskSchema, await parseJsonBody(request));
  if (!parsed.ok) return parsed.response;

  const { matterId, assigneeId, title, description, dueDate, priority } = parsed.data;

  if (matterId && !(await matterBelongsToFirm(user.firmId, matterId))) {
    return jsonError("Select a matter from your workspace.", 400);
  }
  if (assigneeId && !(await userBelongsToFirm(user.firmId, assigneeId))) {
    return jsonError("Select a team member from your firm.", 400);
  }

  try {
    const task = await prisma.task.create({
      data: {
        firmId: user.firmId,
        createdById: user.id,
        matterId: matterId || null,
        assigneeId: assigneeId || null,
        title,
        description,
        dueDate: dueDate ? parseISODate(dueDate) : null,
        priority,
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, id: task.id }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Could not save the task.");
  }
}
