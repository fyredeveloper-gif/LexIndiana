import type { Prisma } from "@prisma/client";
import type { SessionUser } from "@/lib/auth";
import { addDaysISO, parseISODate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export type CalendarEventItem = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  location: string | null;
  matterId: string | null;
  matterTitle: string | null;
  createdByName: string;
};

function eventWhere(user: SessionUser): Prisma.CalendarEventWhereInput {
  const where: Prisma.CalendarEventWhereInput = { firmId: user.firmId };
  if (user.role === "CONSULTANT") {
    where.matter = { access: { some: { userId: user.id } } };
  }
  return where;
}

function toCalendarEventItem(event: {
  id: string;
  title: string;
  description: string | null;
  type: string;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  location: string | null;
  matterId: string | null;
  matter: { title: string } | null;
  createdBy: { name: string };
}): CalendarEventItem {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    type: event.type,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt?.toISOString() ?? null,
    allDay: event.allDay,
    location: event.location,
    matterId: event.matterId,
    matterTitle: event.matter?.title ?? null,
    createdByName: event.createdBy.name,
  };
}

export async function getCalendarEvents(
  user: SessionUser,
  options: { from: string; to: string },
): Promise<CalendarEventItem[]> {
  const events = await prisma.calendarEvent.findMany({
    where: {
      ...eventWhere(user),
      startsAt: {
        gte: parseISODate(options.from),
        lt: parseISODate(addDaysISO(options.to, 1)),
      },
    },
    orderBy: { startsAt: "asc" },
    take: 500,
    include: {
      matter: { select: { title: true } },
      createdBy: { select: { name: true } },
    },
  });
  return events.map(toCalendarEventItem);
}

export async function getMatterCalendarEvents(
  user: SessionUser,
  matterId: string,
): Promise<CalendarEventItem[]> {
  const events = await prisma.calendarEvent.findMany({
    where: {
      firmId: user.firmId,
      matterId,
      ...(user.role === "CONSULTANT"
        ? { matter: { access: { some: { userId: user.id } } } }
        : {}),
    },
    orderBy: { startsAt: "asc" },
    take: 100,
    include: {
      matter: { select: { title: true } },
      createdBy: { select: { name: true } },
    },
  });
  return events.map(toCalendarEventItem);
}
