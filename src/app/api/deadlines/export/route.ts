import { requireCapability, unauthorized } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { isoDate, todayISO } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { fileResponse } from "@/lib/download";
import { buildDeadlineCalendar } from "@/lib/ics";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const denied = requireCapability(user.role, "deadline:read");
  if (denied) return denied;

  const url = new URL(request.url);
  const matterId = url.searchParams.get("matterId") || undefined;
  const includeCompleted = url.searchParams.get("includeCompleted") === "1";

  const deadlines = await prisma.deadline.findMany({
    where: {
      firmId: user.firmId,
      ...(user.role === "CONSULTANT" ? { matter: { access: { some: { userId: user.id } } } } : {}),
      ...(includeCompleted ? {} : { completed: false }),
      ...(matterId ? { matterId } : {}),
    },
    orderBy: { dueDate: "asc" },
    include: { matter: { select: { title: true } } },
  });

  const events = deadlines.map((deadline) => ({
    uid: deadline.id,
    dateISO: isoDate(deadline.dueDate),
    title: deadline.matter ? `${deadline.title} — ${deadline.matter.title}` : deadline.title,
    description: [
      deadline.ruleCitation ? `Rule: ${deadline.ruleCitation}` : null,
      `Trigger: ${deadline.triggerEvent}`,
      deadline.notes,
      "Calculated with Lex Indiana; verify against the court's docket.",
    ]
      .filter(Boolean)
      .join("\n"),
    location: deadline.matter?.title,
  }));

  const calendar = buildDeadlineCalendar(events);
  return fileResponse(
    Buffer.from(calendar, "utf8"),
    `lex-indiana-deadlines-${todayISO()}.ics`,
    "text/calendar; charset=utf-8",
  );
}
