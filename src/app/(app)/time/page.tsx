import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { ManualTimeForm, TimerControls } from "@/components/forms/time-tools";
import { Icon } from "@/components/icons";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getActiveTimer, getMatterOptions, getTimeEntries, getUnbilledByMatter } from "@/lib/data";
import { can } from "@/lib/permissions";
import { formatDate, formatDuration, formatMoney, minutesToHours } from "@/lib/dates";

export const metadata = { title: "Time" };

export default async function TimePage() {
  const user = await requireUser();
  if (!can(user.role, "time:own") && !can(user.role, "time:view_all")) notFound();
  const canLogTime = can(user.role, "time:own");
  const canSeeBilling = can(user.role, "invoice:read");
  const showStaff = can(user.role, "time:view_all");
  const canEditAll = can(user.role, "time:edit_all");
  const [matters, entries, unbilledGroups, activeTimer] = await Promise.all([
    getMatterOptions(user),
    getTimeEntries(user),
    getUnbilledByMatter(user),
    getActiveTimer(user),
  ]);

  const unbilledMinutes = unbilledGroups.reduce((sum, group) => sum + group.minutes, 0);
  const unbilledValue = unbilledGroups.reduce((sum, group) => sum + group.value, 0);
  const recordedMinutes = entries.reduce((sum, entry) => sum + entry.minutes, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Timekeeping"
        title="Time"
        description="Start a timer or enter time manually. Unbilled entries flow into invoices and lock once billed."
        actions={
          canSeeBilling ? (
            <Link href="/invoices" className="btn btn-primary">
              <Icon name="invoice" className="h-4 w-4" />
              Invoice unbilled time
            </Link>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Unbilled</p>
          <p className="mt-1 font-serif text-2xl font-semibold text-ink-900">{minutesToHours(unbilledMinutes)} h</p>
          <p className="text-xs text-ink-500">{formatMoney(unbilledValue)} across {unbilledGroups.length} matter{unbilledGroups.length === 1 ? "" : "s"}</p>
        </div>
        <div className="card px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Recorded</p>
          <p className="mt-1 font-serif text-2xl font-semibold text-ink-900">{formatDuration(recordedMinutes)}</p>
          <p className="text-xs text-ink-500">{entries.length} completed entries</p>
        </div>
        <div className="card px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Timer</p>
          <p className="mt-1 font-serif text-2xl font-semibold text-ink-900">{activeTimer ? "Running" : "Idle"}</p>
          <p className="text-xs text-ink-500">{activeTimer ? activeTimer.matterTitle : "No active timer"}</p>
        </div>
      </div>

      {canLogTime ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Start or stop the timer" description="One timer per person" icon="play" />
            <div className="px-5 py-5">
              <TimerControls matters={matters} active={activeTimer} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Add time manually" description="Tenths of an hour, tied to one matter" icon="plus" />
            <div className="px-5 py-5">
              <ManualTimeForm matters={matters} defaultRate={user.defaultHourlyRate} />
            </div>
          </Card>
        </div>
      ) : null}

      {canSeeBilling && unbilledGroups.length > 0 ? (
        <Card>
          <CardHeader title="Unbilled work by matter" description="Ready to include on the next invoice" icon="invoice" />
          <ul className="divide-y divide-ink-100">
            {unbilledGroups.map((group) => (
              <li key={group.matterId} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/matters/${group.matterId}`} className="text-sm font-medium text-ink-900 hover:underline">
                    {group.matterTitle}
                  </Link>
                  <p className="text-[11px] text-ink-500">
                    {group.clientName} · {group.entries.length} entr{group.entries.length === 1 ? "y" : "ies"}
                  </p>
                </div>
                <span className="text-xs text-ink-600">{minutesToHours(group.minutes)} h</span>
                <span className="text-sm font-semibold text-ink-900">{formatMoney(group.value)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Time entries" description="Most recent completed entries" icon="clock" />
        {entries.length === 0 ? (
          <EmptyState
            icon="clock"
            title="No time recorded yet"
            description="Start the timer above, or use the manual form to add a finished entry."
          />
        ) : (
          <div className="table-wrap">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Matter</th>
                  {showStaff ? <th className="th">Staff</th> : null}
                  <th className="th">Work</th>
                  <th className="th text-right">Hours</th>
                  <th className="th text-right">Amount</th>
                  <th className="th">Billing</th>
                  <th className="th w-8" />
                </tr>
              </thead>
              <tbody>
                {entries.slice(0, 60).map((entry) => (
                  <tr key={entry.id}>
                    <td className="td whitespace-nowrap text-ink-600">{formatDate(entry.workDate)}</td>
                    <td className="td">
                      <Link href={`/matters/${entry.matterId}`} className="text-xs font-medium text-ink-700 hover:underline">
                        {entry.matterTitle}
                      </Link>
                    </td>
                    {showStaff ? <td className="td text-xs text-ink-600">{entry.staffName ?? "—"}</td> : null}
                    <td className="td max-w-[320px] truncate">{entry.description}</td>
                    <td className="td text-right tabular-nums">{minutesToHours(entry.minutes)}</td>
                    <td className="td text-right tabular-nums font-medium">{formatMoney(entry.amount)}</td>
                    <td className="td">
                      {entry.invoiceId ? (
                        <Badge className="bg-emerald-50 text-emerald-700">Invoiced</Badge>
                      ) : entry.billable ? (
                        <Badge className="bg-brass-50 text-brass-700">Unbilled</Badge>
                      ) : (
                        <Badge className="bg-ink-100 text-ink-500">Non-billable</Badge>
                      )}
                    </td>
                    <td className="td">
                      {!entry.invoiceId && (canEditAll || entry.userId === user.id) ? (
                        <ActionButton
                          url={`/api/time/${entry.id}`}
                          method="DELETE"
                          label="Delete"
                          busyLabel="…"
                          confirmText="Delete this time entry?"
                          className="text-[11px] font-medium text-ink-400 hover:text-red-600"
                        />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
