import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { CalendarEventEditForm } from "@/components/forms/calendar-tools";
import { Badge, EmptyState } from "@/components/ui";
import { formatDate, formatTime, isoDateInIndiana } from "@/lib/dates";
import { cn, CALENDAR_EVENT_TYPE_LABELS, calendarEventTypeClasses } from "@/lib/utils";
import type { CalendarEventItem } from "@/lib/calendar";

export function CalendarEventList({
  events,
  canWrite,
  hideMatter = false,
  matters,
}: {
  events: CalendarEventItem[];
  canWrite: boolean;
  hideMatter?: boolean;
  matters?: Array<{ id: string; title: string; clientName: string }>;
}) {
  if (events.length === 0) {
    return (
      <EmptyState
        icon="calendar"
        title="Nothing on the calendar"
        description="Add a hearing, meeting, deposition, or deadline."
      />
    );
  }

  return (
    <ul className="divide-y divide-ink-100">
      {events.map((event) => (
        <li key={event.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
          <div className="w-24 shrink-0 text-xs text-ink-500">
            <p className="font-semibold text-ink-800">{formatDate(isoDateInIndiana(event.startsAt))}</p>
            <p>{event.allDay ? "All day" : formatTime(event.startsAt)}</p>
            {event.endsAt && !event.allDay ? (
              <p className="text-[10px]">to {formatTime(event.endsAt)}</p>
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-ink-900">{event.title}</p>
              <Badge className={cn("ring-1 ring-inset", calendarEventTypeClasses(event.type))}>
                {CALENDAR_EVENT_TYPE_LABELS[event.type] ?? event.type}
              </Badge>
            </div>
            <p className="mt-0.5 text-[11px] text-ink-500">
              {event.location ? `${event.location} · ` : ""}
              Added by {event.createdByName}
            </p>
            {!hideMatter && event.matterId ? (
              <Link
                href={`/matters/${event.matterId}`}
                className="mt-1 inline-block text-[11px] text-ink-600 hover:underline"
              >
                {event.matterTitle}
              </Link>
            ) : null}
            {event.description ? (
              <p className="mt-1 max-w-2xl whitespace-pre-wrap text-[11px] leading-relaxed text-ink-500">
                {event.description}
              </p>
            ) : null}
          </div>
          {canWrite ? (
            <ActionButton
              url={`/api/calendar/${event.id}`}
              method="DELETE"
              label="Delete"
              busyLabel="…"
              confirmText="Delete this event?"
              className="shrink-0 text-[11px] font-medium text-ink-400 hover:text-red-600"
            />
          ) : null}
          {canWrite && matters ? (
            <div className="w-full">
              <CalendarEventEditForm
                event={{
                  id: event.id,
                  title: event.title,
                  description: event.description,
                  type: event.type,
                  startsAt: event.startsAt,
                  endsAt: event.endsAt,
                  allDay: event.allDay,
                  location: event.location,
                  matterId: event.matterId,
                  matterTitle: event.matterTitle,
                }}
                matters={matters}
              />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
