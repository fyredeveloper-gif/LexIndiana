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
import { addDaysISO, parseIndianaDateTime, todayISO } from "@/lib/dates";
import { getCalendarEvents } from "@/lib/calendar";
import { matterBelongsToFirm } from "@/lib/tasks";
import { prisma } from "@/lib/prisma";
import { calendarEventSchema } from "@/lib/validation";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "calendar:read");
  if (denied) return denied;

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? todayISO();
  const to = url.searchParams.get("to") ?? addDaysISO(from, 30);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return jsonError("Use YYYY-MM-DD for the calendar range.", 400);
  }
  if (to < from) return jsonError("The calendar range is invalid.", 400);

  const events = await getCalendarEvents(user, { from, to });
  return NextResponse.json({ events });
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const user = await getSessionUser();
  if (!user) return unauthResponse();
  const denied = requireCapability(user.role, "calendar:write");
  if (denied) return denied;

  const parsed = validate(calendarEventSchema, await parseJsonBody(request));
  if (!parsed.ok) return parsed.response;

  const { matterId, title, description, type, startsAt, endsAt, allDay, location } = parsed.data;
  if (matterId && !(await matterBelongsToFirm(user.firmId, matterId))) {
    return jsonError("Select a matter from your workspace.", 400);
  }

  try {
    const start = parseIndianaDateTime(startsAt);
    const end = endsAt ? parseIndianaDateTime(endsAt) : null;
    const event = await prisma.calendarEvent.create({
      data: {
        firmId: user.firmId,
        createdById: user.id,
        matterId: matterId || null,
        title,
        description,
        type,
        startsAt: start,
        endsAt: end,
        allDay,
        location,
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, id: event.id }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Could not save the event.");
  }
}
