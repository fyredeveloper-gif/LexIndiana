import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarEventForm } from "@/components/forms/calendar-tools";
import { CalendarEventList } from "@/components/calendar-event-list";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getMatterOptions } from "@/lib/data";
import { getCalendarEvents, type CalendarEventItem } from "@/lib/calendar";
import { can } from "@/lib/permissions";
import { addDaysISO, formatTime, isoDateInIndiana, todayISO } from "@/lib/dates";
import { cn, CALENDAR_EVENT_TYPE_LABELS, calendarEventTypeClasses } from "@/lib/utils";

export const metadata = { title: "Calendar" };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CELLS = 42;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

function monthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireUser();
  if (!can(user.role, "calendar:read")) notFound();
  const canWrite = can(user.role, "calendar:write");
  const { month: requestedMonth } = await searchParams;
  const today = todayISO();
  const validMonth = requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth : today.slice(0, 7);
  const [year, month] = validMonth.split("-").map(Number);
  const monthStart = `${year}-${pad(month)}-01`;
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const gridStart = addDaysISO(monthStart, -firstWeekday);
  const gridEnd = addDaysISO(gridStart, CELLS - 1);
  const previousMonth = monthKey(new Date(Date.UTC(year, month - 2, 1)));
  const nextMonth = monthKey(new Date(Date.UTC(year, month, 1)));

  const [events, matters] = await Promise.all([
    getCalendarEvents(user, { from: gridStart, to: gridEnd }),
    canWrite ? getMatterOptions(user) : Promise.resolve([]),
  ]);

  const eventsByDay = new Map<string, CalendarEventItem[]>();
  for (const event of events) {
    const day = isoDateInIndiana(event.startsAt);
    const list = eventsByDay.get(day) ?? [];
    list.push(event);
    eventsByDay.set(day, list);
  }
  const eventsInMonth = events.filter((event) => isoDateInIndiana(event.startsAt).slice(0, 7) === validMonth);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Firm schedule"
        title="Calendar"
        description="Hearings, meetings, depositions, and internal deadlines in one Indiana-time calendar."
        actions={
          <>
            <Link href={`/calendar?month=${previousMonth}`} className="btn btn-secondary btn-sm">
              ← Previous
            </Link>
            <Link href="/calendar" className="btn btn-secondary btn-sm">
              Today
            </Link>
            <Link href={`/calendar?month=${nextMonth}`} className="btn btn-secondary btn-sm">
              Next →
            </Link>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader
            title={monthLabel(year, month)}
            description={`${events.length} event${events.length === 1 ? "" : "s"} in this view`}
            icon="calendar"
          />
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-7 border-b border-ink-100 bg-ink-50/70">
                {WEEKDAYS.map((day) => (
                  <div
                    key={day}
                    className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-ink-500"
                  >
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {Array.from({ length: CELLS }, (_, index) => {
                  const date = addDaysISO(gridStart, index);
                  const inMonth = date.slice(0, 7) === validMonth;
                  const isToday = date === today;
                  const dayEvents = eventsByDay.get(date) ?? [];
                  return (
                    <div
                      key={date}
                      className={cn(
                        "min-h-[112px] border-b border-r border-ink-100 p-1.5",
                        !inMonth && "bg-ink-50/50",
                        isToday && "bg-brass-50/70",
                      )}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span
                          className={cn(
                            "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium",
                            isToday
                              ? "bg-ink-950 text-brass-200"
                              : inMonth
                                ? "text-ink-700"
                                : "text-ink-400",
                          )}
                        >
                          {Number(date.slice(8, 10))}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {dayEvents.slice(0, 3).map((event) => {
                          const chip = (
                            <span
                              title={`${event.title}${event.matterTitle ? ` — ${event.matterTitle}` : ""}`}
                              className={cn(
                                "block truncate rounded border px-1.5 py-0.5 text-[10px] font-medium",
                                calendarEventTypeClasses(event.type),
                              )}
                            >
                              {!event.allDay ? `${formatTime(event.startsAt)} ` : ""}
                              {event.title}
                            </span>
                          );
                          return event.matterId ? (
                            <Link key={event.id} href={`/matters/${event.matterId}`} className="block">
                              {chip}
                            </Link>
                          ) : (
                            <div key={event.id}>{chip}</div>
                          );
                        })}
                        {dayEvents.length > 3 ? (
                          <p className="px-1 text-[10px] font-medium text-ink-400">
                            +{dayEvents.length - 3} more
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          {canWrite ? (
            <Card>
              <CardHeader title="Add an event" description="Times are entered in Indiana local time." icon="plus" />
              <div className="px-5 py-5">
                <CalendarEventForm matters={matters} defaultDate={today} />
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Event key" icon="calendar" />
            <div className="flex flex-wrap gap-2 px-5 py-4">
              {Object.entries(CALENDAR_EVENT_TYPE_LABELS).map(([type, label]) => (
                <span
                  key={type}
                  className={cn("rounded border px-2 py-1 text-[10px] font-medium", calendarEventTypeClasses(type))}
                >
                  {label}
                </span>
              ))}
            </div>
            <p className="border-t border-ink-100 px-5 py-3 text-[10px] leading-relaxed text-ink-400">
              Events on shared matters are visible to consultants with access. Firm-wide events stay visible to
              staff only.
            </p>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Events this month"
          description={`${eventsInMonth.length} event${eventsInMonth.length === 1 ? "" : "s"} · edit details without deleting the record`}
          icon="calendar"
        />
        <CalendarEventList
          events={eventsInMonth}
          canWrite={canWrite}
          matters={canWrite ? matters : undefined}
        />
      </Card>
    </div>
  );
}
