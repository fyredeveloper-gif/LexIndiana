import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { DeadlineCalculator } from "@/components/forms/deadline-tools";
import { DocumentPanel } from "@/components/forms/document-tools";
import { MatterAccessPanel } from "@/components/forms/matter-access";
import { CalendarEventForm } from "@/components/forms/calendar-tools";
import { MatterForm, PartyForm } from "@/components/forms/matter-forms";
import { TaskForm } from "@/components/forms/task-tools";
import { ManualTimeForm, TimerControls } from "@/components/forms/time-tools";
import { CalendarEventList } from "@/components/calendar-event-list";
import { TaskList } from "@/components/task-list";
import { Icon } from "@/components/icons";
import { Badge, Callout, Card, CardHeader, EmptyState, PageHeader, SectionRow, StatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getMatterCalendarEvents } from "@/lib/calendar";
import { getActiveTimer, getContacts, getMatterDetail, getTemplates } from "@/lib/data";
import { getFirmConsultants, getFirmMemberOptions, getMatterAccess } from "@/lib/firm";
import { getMatterTasks } from "@/lib/tasks";
import { can } from "@/lib/permissions";
import { formatDate, formatDuration, formatMoney, minutesToHours, relativeDueLabel, todayISO } from "@/lib/dates";
import { CONTACT_TYPE_LABELS, INVOICE_STATUS_LABELS, MATTER_STATUS_LABELS, cn, formatFileSize } from "@/lib/utils";

export default async function MatterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const matter = await getMatterDetail(user, id);
  if (!matter) notFound();

  const canWrite = can(user.role, "matter:write");
  const canTime = can(user.role, "time:own");
  const canBill = can(user.role, "invoice:read");
  const canWriteDocuments = can(user.role, "document:write");
  const canShare = can(user.role, "consultant:share");
  const canWriteDeadlines = can(user.role, "deadline:write");
  const canEditAllTime = can(user.role, "time:edit_all");
  const canWriteTasks = can(user.role, "task:write");
  const canWriteCalendar = can(user.role, "calendar:write");

  const [templates, contacts, activeTimer, consultants, access, tasks, calendarEvents, members] = await Promise.all([
    getTemplates(user),
    getContacts(user),
    getActiveTimer(user),
    canShare ? getFirmConsultants(user.firmId) : Promise.resolve([]),
    canShare ? getMatterAccess(matter.id) : Promise.resolve([]),
    getMatterTasks(user, matter.id),
    getMatterCalendarEvents(user, matter.id),
    canWriteTasks ? getFirmMemberOptions(user.firmId) : Promise.resolve([]),
  ]);

  const matterOptions = [{ id: matter.id, title: matter.title, clientName: matter.client.name }];
  const unbilledHours = minutesToHours(matter.unbilled.minutes);
  const openDeadlines = matter.deadlines.filter((deadline) => !deadline.completed);
  const timeEntries = matter.timeEntries.filter((entry) => entry.endedAt);
  const openTasks = tasks.filter((task) => !task.completed);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/matters" className="inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-900">
          <Icon name="arrowLeft" className="h-3.5 w-3.5" />
          All matters
        </Link>
      </div>

      <PageHeader
        eyebrow={`${matter.county} County · ${matter.practiceArea}`}
        title={matter.title}
        description={
          <>
            {matter.causeNumber ? <span className="font-mono text-xs">{matter.causeNumber}</span> : "No cause number yet"}
            {matter.courtName ? <span> · {matter.courtName}</span> : null}
          </>
        }
        actions={
          <>
            <StatusBadge status={matter.status} label={MATTER_STATUS_LABELS[matter.status]} />
            <a href={`/api/deadlines/export?matterId=${matter.id}`} className="btn btn-secondary btn-sm">
              <Icon name="download" className="h-3.5 w-3.5" />
              Export deadlines
            </a>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Matter information"
            description={`Opened ${formatDate(matter.openedAt)}`}
            icon="briefcase"
            action={
              canWrite ? (
              <details className="relative">
                <summary className="btn btn-secondary btn-sm cursor-pointer list-none">Edit</summary>
                <div className="absolute right-0 z-20 mt-2 w-[min(92vw,620px)] rounded-xl border border-ink-200 bg-white p-5 shadow-xl">
                  <MatterForm
                    clients={contacts.filter((contact) => contact.type === "CLIENT").map(({ id: clientId, name }) => ({ id: clientId, name }))}
                    matter={{
                      id: matter.id,
                      clientId: matter.client.id,
                      title: matter.title,
                      causeNumber: matter.causeNumber,
                      county: matter.county,
                      courtName: matter.courtName,
                      practiceArea: matter.practiceArea,
                      status: matter.status,
                      notes: matter.notes,
                    }}
                  />
                </div>
              </details>
              ) : null
            }
          />
          <dl className="px-5 py-2">
            <SectionRow label="Client">{matter.client.name}</SectionRow>
            <SectionRow label="Cause number">
              <span className="font-mono text-[13px]">{matter.causeNumber ?? "—"}</span>
            </SectionRow>
            <SectionRow label="Court">{matter.courtName ?? "—"}</SectionRow>
            <SectionRow label="County">{matter.county} County, Indiana</SectionRow>
            <SectionRow label="Practice area">{matter.practiceArea}</SectionRow>
            <SectionRow label="Status">{MATTER_STATUS_LABELS[matter.status] ?? matter.status}</SectionRow>
            <SectionRow label="Notes">
              {matter.notes ? <span className="whitespace-pre-wrap">{matter.notes}</span> : <span className="text-ink-400">No notes yet.</span>}
            </SectionRow>
          </dl>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Primary client" icon="users" />
            <div className="space-y-2 px-5 py-4 text-sm">
              <p className="font-medium text-ink-900">{matter.client.name}</p>
              {matter.client.organization ? <p className="text-xs text-ink-500">{matter.client.organization}</p> : null}
              {matter.client.email ? (
                <p className="flex items-center gap-2 text-xs text-ink-600">
                  <Icon name="mail" className="h-3.5 w-3.5 text-ink-400" />
                  {matter.client.email}
                </p>
              ) : null}
              {matter.client.phone ? (
                <p className="flex items-center gap-2 text-xs text-ink-600">
                  <Icon name="phone" className="h-3.5 w-3.5 text-ink-400" />
                  {matter.client.phone}
                </p>
              ) : null}
              {matter.client.address ? <p className="text-xs leading-relaxed text-ink-500">{matter.client.address}</p> : null}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Parties & witnesses"
              description="Opposing party, counsel, and witnesses on this matter"
              icon="shield"
            />
            <div className="px-5 py-4">
              {matter.parties.length === 0 ? (
                <p className="mb-3 text-xs text-ink-500">No additional parties linked yet.</p>
              ) : (
                <ul className="mb-4 space-y-2">
                  {matter.parties.map((party) => (
                    <li key={party.id} className="flex items-start justify-between gap-2 rounded-lg border border-ink-100 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-ink-800">{party.contact.name}</p>
                        <p className="text-[11px] text-ink-500">
                          {CONTACT_TYPE_LABELS[party.role] ?? party.role}
                          {party.contact.organization ? ` · ${party.contact.organization}` : ""}
                        </p>
                      </div>
                      {canWrite ? (
                        <ActionButton
                          url={`/api/matters/${matter.id}/parties?partyId=${party.id}`}
                          method="DELETE"
                          label="Remove"
                          busyLabel="…"
                          className="text-[11px] font-medium text-ink-400 hover:text-red-600"
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {canWrite ? (
                <PartyForm
                  matterId={matter.id}
                  contacts={contacts.map((contact) => ({ id: contact.id, name: contact.name, type: contact.type }))}
                />
              ) : null}
            </div>
          </Card>
        </div>
      </div>

      {canTime ? (
      <Card>
        <CardHeader
          title="Time & billing"
          description={
            canBill
              ? `${unbilledHours} unbilled hours · ${formatMoney(matter.unbilled.value)}`
              : "Your recorded time on this matter"
          }
          icon="clock"
          action={
            canBill ? (
              <Link href="/invoices" className="btn btn-secondary btn-sm">
                Invoice unbilled time
              </Link>
            ) : null
          }
        />
        <div className="grid gap-5 border-b border-ink-100 px-5 py-5 lg:grid-cols-2">
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Timer</p>
            <TimerControls
              matters={matterOptions}
              active={activeTimer && activeTimer.matterId === matter.id ? activeTimer : null}
            />
            {activeTimer && activeTimer.matterId !== matter.id ? (
              <p className="mt-2 text-[11px] text-amber-700">
                A timer is running on another matter. Stop it from the sidebar before starting one here.
              </p>
            ) : null}
          </div>
          <details className="group">
            <summary className="mb-3 cursor-pointer list-none text-[11px] font-semibold uppercase tracking-wider text-ink-500">
              Manual time entry
              <span className="ml-2 text-brass-600 group-open:hidden">+ Add</span>
            </summary>
            <ManualTimeForm matters={matterOptions} defaultRate={user.defaultHourlyRate} />
          </details>
        </div>

        {timeEntries.length === 0 ? (
          <EmptyState icon="clock" title="No time recorded" description="Start a timer or add a manual entry to begin billing this matter." />
        ) : (
          <div className="table-wrap">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Work</th>
                  <th className="th text-right">Hours</th>
                  <th className="th text-right">Rate</th>
                  <th className="th text-right">Amount</th>
                  <th className="th">Billing</th>
                  <th className="th w-8" />
                </tr>
              </thead>
              <tbody>
                {timeEntries.slice(0, 25).map((entry) => (
                  <tr key={entry.id}>
                    <td className="td whitespace-nowrap text-ink-600">{formatDate(entry.workDate)}</td>
                    <td className="td">{entry.description}</td>
                    <td className="td text-right tabular-nums">{minutesToHours(entry.minutes)}</td>
                    <td className="td text-right tabular-nums text-ink-600">{formatMoney(entry.rate)}</td>
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
                      {!entry.invoiceId && (canEditAllTime || entry.userId === user.id) ? (
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
      ) : null}

      <Card>
        <CardHeader
          title="Deadlines"
          description={`${openDeadlines.length} open · Trial Rule 6 calculations`}
          icon="calendar"
          action={
            <a href={`/api/deadlines/export?matterId=${matter.id}`} className="btn btn-secondary btn-sm">
              <Icon name="download" className="h-3.5 w-3.5" />
              .ics
            </a>
          }
        />
        {matter.deadlines.length === 0 ? (
          <EmptyState icon="calendar" title="No deadlines yet" description="Use the calculator below to create one from a trigger event." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {matter.deadlines.map((deadline) => (
              <li key={deadline.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div
                  className={cn(
                    "w-24 shrink-0 text-xs font-semibold",
                    deadline.completed ? "text-ink-400 line-through" : deadline.dueDate < new Date().toISOString().slice(0, 10) ? "text-red-600" : "text-ink-800",
                  )}
                >
                  {formatDate(deadline.dueDate)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-medium", deadline.completed ? "text-ink-400 line-through" : "text-ink-900")}>
                    {deadline.title}
                  </p>
                  <p className="text-[11px] text-ink-500">
                    {deadline.triggerEvent} · {formatDate(deadline.triggerDate)}
                    {deadline.ruleCitation ? ` · ${deadline.ruleCitation}` : ""}
                    {deadline.daysAdded > 0 ? " · +3 mail days" : ""}
                  </p>
                </div>
                {!deadline.completed ? (
                  <span className="badge bg-amber-50 text-amber-800">{relativeDueLabel(deadline.dueDate)}</span>
                ) : (
                  <Badge className="bg-emerald-50 text-emerald-700">Completed</Badge>
                )}
                {canWriteDeadlines ? (
                  <div className="flex items-center gap-2">
                    <ActionButton
                      url={`/api/deadlines/${deadline.id}`}
                      method="PATCH"
                      body={{ completed: !deadline.completed }}
                      label={deadline.completed ? "Reopen" : "Mark done"}
                      busyLabel="…"
                      className="btn btn-secondary btn-sm"
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
              </li>
            ))}
          </ul>
        )}
        {canWriteDeadlines ? (
          <details className="group border-t border-ink-100">
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-xs font-semibold text-ink-700">
              Calculate a new deadline for this matter
              <span className="text-brass-600 group-open:hidden">Expand</span>
              <span className="hidden text-brass-600 group-open:inline">Collapse</span>
            </summary>
            <div className="border-t border-ink-100 px-5 py-5">
              <DeadlineCalculator matters={matterOptions} defaultMatterId={matter.id} />
            </div>
          </details>
        ) : null}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Tasks"
            description={`${openTasks.length} open · follow-ups for this matter`}
            icon="check"
            action={
              <Link href="/tasks" className="btn btn-secondary btn-sm">
                All tasks
              </Link>
            }
          />
          <TaskList tasks={tasks} canWrite={canWriteTasks} hideMatter matters={matterOptions} members={members} />
          {canWriteTasks ? (
            <details className="group border-t border-ink-100">
              <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-xs font-semibold text-ink-700">
                Add a task to this matter
                <span className="text-brass-600 group-open:hidden">Expand</span>
                <span className="hidden text-brass-600 group-open:inline">Collapse</span>
              </summary>
              <div className="border-t border-ink-100 px-5 py-4">
                <TaskForm matters={matterOptions} members={members} defaultMatterId={matter.id} />
              </div>
            </details>
          ) : null}
        </Card>

        <Card>
          <CardHeader
            title="Calendar"
            description={`${calendarEvents.length} event${calendarEvents.length === 1 ? "" : "s"} on this matter`}
            icon="calendar"
            action={
              <Link href="/calendar" className="btn btn-secondary btn-sm">
                Open calendar
              </Link>
            }
          />
          <CalendarEventList
            events={calendarEvents}
            canWrite={canWriteCalendar}
            hideMatter
            matters={matterOptions}
          />
          {canWriteCalendar ? (
            <details className="group border-t border-ink-100">
              <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-xs font-semibold text-ink-700">
                Add an event to this matter
                <span className="text-brass-600 group-open:hidden">Expand</span>
                <span className="hidden text-brass-600 group-open:inline">Collapse</span>
              </summary>
              <div className="border-t border-ink-100 px-5 py-4">
                <CalendarEventForm
                  matters={matterOptions}
                  defaultMatterId={matter.id}
                  defaultDate={todayISO()}
                />
              </div>
            </details>
          ) : null}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Documents"
          description="Uploads and generated .docx files are stored in this matter's isolated folder"
          icon="template"
          action={
            can(user.role, "template:read") ? (
              <Link href="/templates" className="btn btn-secondary btn-sm">
                Manage templates
              </Link>
            ) : null
          }
        />
        {canWriteDocuments ? (
          <div className="border-b border-ink-100 px-5 py-5">
            <DocumentPanel matterId={matter.id} templates={templates.map(({ id: templateId, name }) => ({ id: templateId, name }))} />
          </div>
        ) : null}
        {matter.documents.length === 0 ? (
          <EmptyState icon="template" title="No documents" description="Upload a file or generate one from your template library." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {matter.documents.map((document) => (
              <li key={document.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-50 text-ink-500">
                  <Icon name="invoice" className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-800">{document.fileName}</p>
                  <p className="text-[11px] text-ink-500">
                    {formatFileSize(document.size)} · {document.kind === "GENERATED" ? `Generated from ${document.templateName ?? "template"}` : "Uploaded"} ·{" "}
                    {formatDate(document.createdAt.slice(0, 10))}
                  </p>
                </div>
                <a href={`/api/documents/${document.id}`} className="btn btn-secondary btn-sm">
                  <Icon name="download" className="h-3.5 w-3.5" />
                  Download
                </a>
                {canWriteDocuments ? (
                  <ActionButton
                    url={`/api/documents/${document.id}`}
                    method="DELETE"
                    label="Delete"
                    busyLabel="…"
                    confirmText={`Delete ${document.fileName}?`}
                    className="text-[11px] font-medium text-ink-400 hover:text-red-600"
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {canBill ? (
      <Card>
        <CardHeader title="Invoices for this matter" icon="invoice" action={<Link href="/invoices" className="btn btn-secondary btn-sm">All invoices</Link>} />
        {matter.invoices.length === 0 ? (
          <EmptyState icon="invoice" title="No invoices yet" description="Select unbilled time on the Invoices page to generate one." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {matter.invoices.map((invoice) => (
              <li key={invoice.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/invoices/${invoice.id}`} className="text-sm font-medium text-ink-900 hover:underline">
                    {invoice.number}
                  </Link>
                  <p className="text-[11px] text-ink-500">
                    Issued {formatDate(invoice.issueDate)}
                    {invoice.dueDate ? ` · due ${formatDate(invoice.dueDate)}` : ""}
                  </p>
                </div>
                <StatusBadge status={invoice.status} label={INVOICE_STATUS_LABELS[invoice.status]} />
                <span className="text-sm font-semibold tabular-nums text-ink-900">{formatMoney(invoice.total)}</span>
                <Link href={`/invoices/${invoice.id}`} className="btn btn-secondary btn-sm">
                  View
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      ) : null}

      {canShare ? (
        <Card>
          <CardHeader
            title="Consultant access"
            description="Consultants are external reviewers. They only see matters shared here, read-only."
            icon="shield"
          />
          <div className="px-5 py-4">
            <MatterAccessPanel
              matterId={matter.id}
              consultants={consultants.map((member) => ({
                userId: member.userId,
                name: member.user.name,
                email: member.user.email,
              }))}
              granted={access}
            />
          </div>
        </Card>
      ) : null}

      {canBill && matter.unbilled.count > 0 ? (
        <Callout tone="info" title="Ready to bill">
          {formatDuration(matter.unbilled.minutes)} of unbilled time ({formatMoney(matter.unbilled.value)}) is available on
          this matter.{" "}
          <Link href="/invoices" className="font-semibold underline">
            Generate an invoice
          </Link>
          .
        </Callout>
      ) : null}
    </div>
  );
}
