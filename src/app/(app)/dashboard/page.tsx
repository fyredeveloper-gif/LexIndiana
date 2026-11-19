import Link from "next/link";
import { Icon } from "@/components/icons";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getDashboard, getNewIntakeCount } from "@/lib/data";
import { formatDate, formatDateLong, formatDuration, formatMoney, relativeDueLabel } from "@/lib/dates";
import { INDIANA_TIME_ZONE } from "@/lib/dates";
import { MATTER_STATUS_LABELS } from "@/lib/utils";
import { STAFF_ROLE_LABELS, can, type Capability } from "@/lib/permissions";

export const metadata = { title: "Dashboard" };

const QUICK_ACTIONS: Array<{ href: string; label: string; icon: string; detail: string; capability: Capability }> = [
  { href: "/matters", label: "Open a matter", icon: "briefcase", detail: "Intake and case details", capability: "matter:write" },
  { href: "/conflicts", label: "Conflict check", icon: "shield", detail: "Search names and aliases", capability: "conflict:read" },
  { href: "/intake", label: "Review intake", icon: "mail", detail: "Prospective client submissions", capability: "intake:view" },
  { href: "/tasks", label: "Review tasks", icon: "check", detail: "Assignments and follow-ups", capability: "task:read" },
  { href: "/calendar", label: "Open calendar", icon: "calendar", detail: "Hearings, meetings, depositions", capability: "calendar:read" },
  { href: "/deadlines", label: "Calculate deadline", icon: "clock", detail: "Trial Rule 6 engine", capability: "deadline:write" },
  { href: "/time", label: "Track time", icon: "clock", detail: "Timer or manual entry", capability: "time:own" },
  { href: "/invoices", label: "Invoice unbilled time", icon: "invoice", detail: "Generate a PDF", capability: "invoice:read" },
  { href: "/templates", label: "Assemble a document", icon: "template", detail: "Merge .docx templates", capability: "template:write" },
];

export default async function DashboardPage() {
  const user = await requireUser();
  const [data, newIntake] = await Promise.all([getDashboard(user), getNewIntakeCount(user)]);

  const indianaHour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: INDIANA_TIME_ZONE, hour: "numeric", hour12: false }).format(new Date()),
  );
  const greeting = indianaHour < 12 ? "Good morning" : indianaHour < 18 ? "Good afternoon" : "Good evening";
  const firstName = user.name.split(/\s+/)[0];
  const unbilledHours = (data.stats.unbilledMinutes / 60).toFixed(2);
  const quickActions = QUICK_ACTIONS.filter((action) => can(user.role, action.capability));
  const canWriteMatters = can(user.role, "matter:write");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={user.firmName ?? "Your practice"}
        title={`${greeting}, ${firstName}.`}
        description={`${formatDateLong(data.today)} · ${data.stats.activeMatters} active matter${
          data.stats.activeMatters === 1 ? "" : "s"
        } in your workspace.`}
        actions={
          <>
            {canWriteMatters ? (
              <Link href="/matters" className="btn btn-primary">
                <Icon name="plus" className="h-4 w-4" />
                New matter
              </Link>
            ) : null}
            <a href="/api/deadlines/export" className="btn btn-secondary">
              <Icon name="download" className="h-4 w-4" />
              Export deadlines
            </a>
          </>
        }
      />

      <div className={`grid gap-4 sm:grid-cols-2 ${data.showFinancials ? "xl:grid-cols-4" : "xl:grid-cols-2"}`}>
        <Stat
          label="Active matters"
          value={String(data.stats.activeMatters)}
          detail={`${data.stats.intakeMatters} in intake`}
          icon="briefcase"
        />
        <Stat
          label="Deadlines · 30 days"
          value={String(data.stats.dueThisMonth)}
          detail={data.stats.overdue > 0 ? `${data.stats.overdue} overdue` : "Nothing overdue"}
          icon="calendar"
          accent={data.stats.overdue > 0 ? "danger" : "default"}
        />
        {data.showFinancials ? (
          <>
            <Stat
              label="Unbilled time"
              value={`${unbilledHours} h`}
              detail={`${formatMoney(data.stats.unbilledValue)} at current rates`}
              icon="clock"
              accent="brass"
            />
            <Stat
              label="Outstanding invoices"
              value={formatMoney(data.stats.outstanding)}
              detail={`${formatMoney(data.stats.collected)} collected`}
              icon="invoice"
            />
          </>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="Upcoming deadlines"
              description="Next 30 days, calculated under Ind. R. Trial P. 6"
              icon="calendar"
              action={
                <Link href="/deadlines" className="btn btn-secondary btn-sm">
                  All deadlines
                </Link>
              }
            />
            {data.upcomingDeadlines.length === 0 ? (
              <EmptyState
                icon="calendar"
                title="No deadlines in the next 30 days"
                description="Calculate a deadline from a trigger event and it will appear here."
                action={
                  <Link href="/deadlines" className="btn btn-secondary btn-sm">
                    Open deadline calculator
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-ink-100">
                {data.upcomingDeadlines.map((deadline) => {
                  const overdue = deadline.dueDate < data.today;
                  return (
                    <li key={deadline.id} className="flex items-start gap-3 px-5 py-3">
                      <div
                        className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg border text-center ${
                          overdue ? "border-red-200 bg-red-50 text-red-700" : "border-ink-200 bg-ink-50 text-ink-700"
                        }`}
                      >
                        <span className="text-[9px] font-semibold uppercase tracking-wide">
                          {formatDate(deadline.dueDate).split(" ")[0]}
                        </span>
                        <span className="text-sm font-semibold leading-none">
                          {formatDate(deadline.dueDate).split(" ")[1].replace(",", "")}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink-900">{deadline.title}</p>
                        <p className="truncate text-xs text-ink-500">
                          {deadline.matterTitle ?? "Firm-wide deadline"}
                          {deadline.ruleCitation ? ` · ${deadline.ruleCitation}` : ""}
                        </p>
                      </div>
                      <span
                        className={`badge shrink-0 ${
                          overdue ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"
                        }`}
                      >
                        {relativeDueLabel(deadline.dueDate)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Recent matters"
              description="Most recently updated matters in your practice"
              icon="briefcase"
              action={
                <Link href="/matters" className="btn btn-secondary btn-sm">
                  View all
                </Link>
              }
            />
            {data.recentMatters.length === 0 ? (
              <EmptyState
                icon="briefcase"
                title="No matters yet"
                description="Open your first matter to start tracking deadlines, time, and documents."
                action={
                  <Link href="/matters" className="btn btn-primary btn-sm">
                    Open a matter
                  </Link>
                }
              />
            ) : (
              <div className="table-wrap">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th">Matter</th>
                      <th className="th">Client</th>
                      <th className="th hidden sm:table-cell">County</th>
                      <th className="th">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentMatters.map((matter) => (
                      <tr key={matter.id} className="transition hover:bg-ink-50/60">
                        <td className="td">
                          <Link href={`/matters/${matter.id}`} className="font-medium text-ink-900 hover:underline">
                            {matter.title}
                          </Link>
                          {matter.causeNumber ? (
                            <p className="font-mono text-[11px] text-ink-400">{matter.causeNumber}</p>
                          ) : null}
                        </td>
                        <td className="td text-ink-600">{matter.clientName}</td>
                        <td className="td hidden text-ink-600 sm:table-cell">{matter.county}</td>
                        <td className="td">
                          <StatusBadge status={matter.status} label={MATTER_STATUS_LABELS[matter.status]} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Quick actions" icon="sparkle" />
            <div className="grid grid-cols-1 gap-1 p-3 sm:grid-cols-2 lg:grid-cols-1">
              {quickActions.length === 0 ? (
                <Link
                  href="/matters"
                  className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-ink-50"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-900 text-brass-300">
                    <Icon name="briefcase" className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-ink-800">View shared matters</span>
                    <span className="block text-[11px] text-ink-400">Matters shared with you</span>
                  </span>
                  <Icon name="arrowRight" className="h-4 w-4 text-ink-300" />
                </Link>
              ) : null}
              {quickActions.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-ink-50"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-900 text-brass-300 transition group-hover:bg-ink-800">
                    <Icon name={action.icon} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-ink-800">{action.label}</span>
                    <span className="block text-[11px] text-ink-400">
                      {action.href === "/intake" && newIntake > 0 ? `${newIntake} awaiting review` : action.detail}
                    </span>
                  </span>
                  <Icon name="arrowRight" className="h-4 w-4 text-ink-300" />
                </Link>
              ))}
            </div>
          </Card>

          {data.showFinancials ? (
          <Card>
            <CardHeader title="Billing snapshot" icon="invoice" />
            <dl className="px-5 py-2">
              <div className="flex items-center justify-between border-b border-ink-100 py-2.5 text-sm">
                <dt className="text-ink-500">Unbilled time</dt>
                <dd className="font-medium text-ink-900">
                  {formatDuration(data.stats.unbilledMinutes)} · {formatMoney(data.stats.unbilledValue)}
                </dd>
              </div>
              <div className="flex items-center justify-between border-b border-ink-100 py-2.5 text-sm">
                <dt className="text-ink-500">Outstanding</dt>
                <dd className="font-medium text-ink-900">{formatMoney(data.stats.outstanding)}</dd>
              </div>
              <div className="flex items-center justify-between py-2.5 text-sm">
                <dt className="text-ink-500">Collected</dt>
                <dd className="font-medium text-emerald-700">{formatMoney(data.stats.collected)}</dd>
              </div>
            </dl>
            <div className="border-t border-ink-100 px-5 py-3">
              <Link href="/invoices" className="btn btn-secondary btn-sm w-full">
                Go to invoicing
              </Link>
            </div>
          </Card>
          ) : null}

          <Card className="bg-ink-950 text-white">
            <div className="px-5 py-4">
              <div className="flex items-center gap-2 text-brass-300">
                <Icon name="shield" className="h-4 w-4" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em]">Firm isolation · {STAFF_ROLE_LABELS[user.role]}</p>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-ink-300">
                Every query is scoped to this firm, and files stay under the firm&apos;s private storage
                prefix. Your role limits which records and actions you can reach.
              </p>
              <Badge className="mt-3 bg-white/10 text-ink-200">Private storage</Badge>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
