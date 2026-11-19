import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { DeadlineCalculator } from "@/components/forms/deadline-tools";
import { Icon } from "@/components/icons";
import { Badge, Callout, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getDeadlines, getMatterOptions } from "@/lib/data";
import { can } from "@/lib/permissions";
import { formatDate, relativeDueLabel, todayISO } from "@/lib/dates";
import { DEADLINE_DISCLAIMER, upcomingHolidays } from "@/lib/deadlines";
import { SERVICE_METHOD_LABELS, cn } from "@/lib/utils";

export const metadata = { title: "Deadlines" };

export default async function DeadlinesPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const user = await requireUser();
  if (!can(user.role, "deadline:read")) notFound();
  const canWrite = can(user.role, "deadline:write");
  const { show } = await searchParams;
  const showAll = show === "all";
  const today = todayISO();

  const [matters, deadlines] = await Promise.all([
    getMatterOptions(user),
    getDeadlines(user, { includeCompleted: showAll }),
  ]);
  const holidays = upcomingHolidays(today, 6);
  const openCount = deadlines.filter((deadline) => !deadline.completed).length;
  const overdueCount = deadlines.filter((deadline) => !deadline.completed && deadline.dueDate < today).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Indiana Rules of Trial Procedure"
        title="Court deadline calculator"
        description="Trigger events, service method, mail extensions, and weekend/holiday roll-forward under Trial Rule 6."
        actions={
          <>
            <a href="/api/deadlines/export" className="btn btn-secondary">
              <Icon name="download" className="h-4 w-4" />
              Export .ics
            </a>
            <Link href={showAll ? "/deadlines" : "/deadlines?show=all"} className="btn btn-secondary">
              {showAll ? "Hide completed" : "Show completed"}
            </Link>
          </>
        }
      />

      {canWrite ? (
      <Card>
        <CardHeader
          title="Calculate a deadline"
          description="The day of the triggering event is excluded; period previews update automatically."
          icon="calendar"
        />
        <div className="px-5 py-5">
          <DeadlineCalculator matters={matters} />
        </div>
      </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader
            title="Tracked deadlines"
            description={`${openCount} open · ${overdueCount} overdue`}
            icon="clock"
            action={
              <a href="/api/deadlines/export?includeCompleted=1" className="btn btn-secondary btn-sm">
                Include completed
              </a>
            }
          />
          {deadlines.length === 0 ? (
            <EmptyState
              icon="calendar"
              title="No deadlines tracked"
              description="Save a calculated deadline and it will appear here, color-coded by urgency."
            />
          ) : (
            <div className="table-wrap">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Due</th>
                    <th className="th">Deadline</th>
                    <th className="th hidden md:table-cell">Matter</th>
                    <th className="th hidden sm:table-cell">Rule</th>
                    <th className="th">Status</th>
                    <th className="th w-8" />
                  </tr>
                </thead>
                <tbody>
                  {deadlines.map((deadline) => {
                    const overdue = !deadline.completed && deadline.dueDate < today;
                    return (
                      <tr key={deadline.id} className={cn(deadline.completed && "opacity-70")}>
                        <td className="td whitespace-nowrap">
                          <span className={cn("font-medium", overdue ? "text-red-600" : "text-ink-800")}>
                            {formatDate(deadline.dueDate)}
                          </span>
                          {!deadline.completed ? (
                            <p className={cn("text-[11px]", overdue ? "text-red-500" : "text-ink-400")}>
                              {relativeDueLabel(deadline.dueDate)}
                            </p>
                          ) : null}
                        </td>
                        <td className="td">
                          <p className={cn("font-medium", deadline.completed ? "line-through" : "text-ink-900")}>
                            {deadline.title}
                          </p>
                          <p className="text-[11px] text-ink-500">
                            {deadline.triggerEvent} · {formatDate(deadline.triggerDate)} ·{" "}
                            {SERVICE_METHOD_LABELS[deadline.serviceMethod] ?? deadline.serviceMethod}
                            {deadline.daysAdded > 0 ? " (+3)" : ""}
                          </p>
                        </td>
                        <td className="td hidden md:table-cell">
                          {deadline.matterId ? (
                            <Link href={`/matters/${deadline.matterId}`} className="text-xs text-ink-600 hover:underline">
                              {deadline.matterTitle}
                            </Link>
                          ) : (
                            <span className="text-xs text-ink-400">Firm-wide</span>
                          )}
                        </td>
                        <td className="td hidden sm:table-cell text-[11px] text-ink-500">
                          {deadline.ruleCitation ?? "—"}
                        </td>
                        <td className="td">
                          {deadline.completed ? (
                            <Badge className="bg-emerald-50 text-emerald-700">Completed</Badge>
                          ) : overdue ? (
                            <Badge className="bg-red-50 text-red-700">Overdue</Badge>
                          ) : (
                            <Badge className="bg-amber-50 text-amber-800">Open</Badge>
                          )}
                        </td>
                        <td className="td">
                          {canWrite ? (
                            <div className="flex items-center gap-2">
                              <ActionButton
                                url={`/api/deadlines/${deadline.id}`}
                                method="PATCH"
                                body={{ completed: !deadline.completed }}
                                label={deadline.completed ? "Reopen" : "Done"}
                                busyLabel="…"
                                className="text-[11px] font-medium text-ink-500 hover:text-ink-900"
                              />
                              <ActionButton
                                url={`/api/deadlines/${deadline.id}`}
                                method="DELETE"
                                label="Delete"
                                busyLabel="…"
                                confirmText="Delete this deadline?"
                                className="text-[11px] font-medium text-ink-400 hover:text-red-600"
                              />
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Indiana legal holidays" description="Ind. Code § 1-1-9-1" icon="calendar" />
            <ul className="divide-y divide-ink-100">
              {holidays.map((holiday) => (
                <li key={`${holiday.date}-${holiday.name}`} className="flex items-center justify-between gap-2 px-5 py-2 text-xs">
                  <span className="text-ink-600">{holiday.name}</span>
                  <span className="whitespace-nowrap font-medium text-ink-800">{formatDate(holiday.date)}</span>
                </li>
              ))}
            </ul>
            <p className="border-t border-ink-100 px-5 py-3 text-[10px] leading-relaxed text-ink-400">
              Saturday holidays are observed the preceding Friday; Sunday holidays the following Monday. Court closures
              and election-day variations should be confirmed with the clerk.
            </p>
          </Card>

          <Callout tone="warning" title="Verify before filing">
            {DEADLINE_DISCLAIMER}
          </Callout>
        </div>
      </div>
    </div>
  );
}
