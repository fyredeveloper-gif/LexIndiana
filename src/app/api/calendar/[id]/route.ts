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
import { parseIndianaDateTime } from "@/lib/dates";
import { matterBelongsToFirm } from "@/lib/tasks";
import { prisma } from "@/lib/prisma";
import { calendarEventUpdateSchema } from "@/lib/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "calendar:write");
  if (denied) return denied;

  const { id } = await params;
  const parsed = validate(calendarEventUpdateSchema, await parseJsonBody(request));
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  if (body.matterId && !(await matterBelongsToFirm(user.firmId, body.matterId))) {
    return jsonError("Select a matter from your workspace.", 400);
  }

  const existing = await prisma.calendarEvent.findFirst({
    where: { id, firmId: user.firmId },
    select: { id: true, startsAt: true, endsAt: true },
  });
  if (!existing) return notFound("Event not found.");

  try {
    const startsAt = body.startsAt ? parseIndianaDateTime(body.startsAt) : existing.startsAt;
    const endsAt =
      body.endsAt === undefined ? existing.endsAt : body.endsAt ? parseIndianaDateTime(body.endsAt) : null;
    if (endsAt && endsAt <= startsAt) {
      return jsonError("The end time must be after the start time.", 422);
    }

    const data: Record<string, unknown> = { startsAt, endsAt };
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description || null;
    if (body.type !== undefined) data.type = body.type;
    if (body.matterId !== undefined) data.matterId = body.matterId || null;
    if (body.allDay !== undefined) data.allDay = body.allDay;
    if (body.location !== undefined) data.location = body.location || null;

    await prisma.calendarEvent.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, "Could not update the event.");
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "calendar:write");
  if (denied) return denied;

  const { id } = await params;
  const deleted = await prisma.calendarEvent.deleteMany({ where: { id, firmId: user.firmId } });
  if (deleted.count === 0) return notFound("Event not found.");

  return NextResponse.json({ ok: true });
}
