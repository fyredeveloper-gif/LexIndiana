import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { IntakeTriage } from "@/components/forms/intake-triage";
import { Icon } from "@/components/icons";
import { Badge, Callout, Card, CardHeader, PageHeader, SectionRow, StatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getIntakeSubmission } from "@/lib/data";
import { getFirmMemberOptions } from "@/lib/firm";
import { can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/dates";
import {
  CONFLICT_STATUS_LABELS,
  CONTACT_TYPE_LABELS,
  INTAKE_STATUS_LABELS,
  MATTER_STATUS_LABELS,
  cn,
  titleCase,
} from "@/lib/utils";

export default async function IntakeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "intake:view")) notFound();
  const { id } = await params;
  const [submission, members] = await Promise.all([
    getIntakeSubmission(user, id),
    can(user.role, "intake:triage")
      ? getFirmMemberOptions(user.firmId).then((members) =>
          members.filter((member) => member.role !== "CONSULTANT"),
        )
      : Promise.resolve([]),
  ]);
  if (!submission) notFound();
  const canTriage = can(user.role, "intake:triage");
  const canDecide = can(user.role, "intake:decide");

  const snapshot = submission.snapshot;
  const needsReview = submission.conflictStatus === "REVIEW";
  const matches = snapshot?.matches ?? [];
  const matterMatches = snapshot?.matterMatches ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/intake" className="inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-900">
          <Icon name="arrowLeft" className="h-3.5 w-3.5" />
          Intake inbox
        </Link>
      </div>

      <PageHeader
        eyebrow={`${submission.reference} · submitted ${formatDateTime(submission.createdAt)}`}
        title={submission.name}
        description={
          <>
            {submission.email} · {submission.phone}
            {submission.organization ? ` · ${submission.organization}` : ""}
          </>
        }
        actions={
          <>
            <StatusBadge
              status={submission.status}
              label={INTAKE_STATUS_LABELS[submission.status] ?? titleCase(submission.status)}
            />
            {submission.matter ? (
              <Link href={`/matters/${submission.matter.id}`} className="btn btn-primary">
                <Icon name="briefcase" className="h-4 w-4" />
                Open matter
              </Link>
            ) : null}
          </>
        }
      />

      {needsReview ? (
        <Callout tone="warning" title="Conflict screening flagged possible matches">
          This submission matched existing records in your workspace. Review the matches below before contacting the
          applicant. The applicant was not told that a match was found.
        </Callout>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Submitted details" description="Public intake form answers" icon="mail" />
            <dl className="px-5 py-2">
              <SectionRow label="Full name">{submission.name}</SectionRow>
              <SectionRow label="Email">{submission.email}</SectionRow>
              <SectionRow label="Phone">{submission.phone}</SectionRow>
              <SectionRow label="Organization">{submission.organization ?? "—"}</SectionRow>
              <SectionRow label="County">{submission.county} County</SectionRow>
              <SectionRow label="Practice area">{submission.practiceArea}</SectionRow>
              <SectionRow label="Opposing parties">{submission.opposingParties ?? "—"}</SectionRow>
              <SectionRow label="Referral source">{submission.referralSource ?? "—"}</SectionRow>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Description" icon="invoice" />
            <div className="px-5 py-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-700">{submission.summary}</p>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Conflict screening"
              description={
                submission.conflictCheckedAt
                  ? `Run ${formatDateTime(submission.conflictCheckedAt)}`
                  : "Not run at submission"
              }
              icon="shield"
            />
            <div className="space-y-3 px-5 py-4">
              <div
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-xs font-medium",
                  needsReview
                    ? "border-red-200 bg-red-50 text-red-700"
                    : submission.conflictStatus === "CLEAR"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-ink-200 bg-ink-50 text-ink-600",
                )}
              >
                {CONFLICT_STATUS_LABELS[submission.conflictStatus] ?? titleCase(submission.conflictStatus)}
                {needsReview ? " — possible matches found" : " — no matches found"}
              </div>

              {snapshot ? (
                <p className="text-[11px] text-ink-500">
                  Scanned {snapshot.scannedContacts} contact{snapshot.scannedContacts === 1 ? "" : "s"} and{" "}
                  {snapshot.scannedMatters} matter{snapshot.scannedMatters === 1 ? "" : "s"} in your workspace.
                </p>
              ) : null}

              {matches.length > 0 ? (
                <ul className="space-y-2">
                  {matches.map((match) => (
                    <li key={match.contactId} className="rounded-lg border border-ink-100 px-3 py-2">
                      <p className="text-xs font-semibold text-ink-800">{match.name}</p>
                      <p className="text-[11px] text-ink-500">
                        {CONTACT_TYPE_LABELS[match.type] ?? titleCase(match.type)} · matched{" "}
                        {match.matchedFields.join(", ").toLowerCase()}
                      </p>
                      {match.matters.length > 0 ? (
                        <p className="mt-1 text-[11px] text-ink-500">
                          Matters:{" "}
                          {match.matters.map((matter, index) => (
                            <span key={matter.id}>
                              {index > 0 ? ", " : ""}
                              <Link href={`/matters/${matter.id}`} className="underline">
                                {matter.title}
                              </Link>
                            </span>
                          ))}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}

              {matterMatches.length > 0 ? (
                <div className="rounded-lg border border-ink-100 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Matter text matches</p>
                  <ul className="mt-1 space-y-1">
                    {matterMatches.map((matter) => (
                      <li key={matter.id} className="text-[11px] text-ink-600">
                        <Link href={`/matters/${matter.id}`} className="underline">
                          {matter.title}
                        </Link>{" "}
                        · {matter.clientName}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {snapshot?.terms?.length ? (
                <p className="text-[10px] leading-relaxed text-ink-400">
                  Search terms: {snapshot.terms.join(", ")}
                </p>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Review status" description="Track the intake workflow" icon="check" />
            <div className="space-y-3 px-5 py-4">
              <div className="flex flex-wrap gap-2">
                {canTriage ? (
                  <ActionButton
                    url={`/api/intake/${submission.id}`}
                    method="PATCH"
                    body={{ status: "CONTACTED" }}
                    label="Mark contacted"
                    busyLabel="Saving…"
                    className="btn btn-secondary btn-sm"
                  />
                ) : null}
                {canDecide ? (
                  <>
                    <ActionButton
                      url={`/api/intake/${submission.id}`}
                      method="PATCH"
                      body={{ status: "CONVERTED" }}
                      label="Mark converted"
                      busyLabel="Saving…"
                      className="btn btn-secondary btn-sm"
                    />
                    <ActionButton
                      url={`/api/intake/${submission.id}`}
                      method="PATCH"
                      body={{ status: "DECLINED" }}
                      label="Decline"
                      busyLabel="Saving…"
                      confirmText="Mark this intake as declined? The matter will remain in your workspace."
                      className="btn btn-danger btn-sm"
                    />
                  </>
                ) : null}
              </div>
              <p className="text-[11px] leading-relaxed text-ink-400">
                {canDecide
                  ? "Status changes are internal. Marking an intake as converted or declined does not change the linked matter's status automatically."
                  : "You can contact, assign, and annotate this request. Conversion and declination are reserved for the owner and attorneys."}
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Assignment & notes" description="Internal triage for this request" icon="users" />
            <div className="px-5 py-4">
              {canTriage ? (
                <IntakeTriage
                  submissionId={submission.id}
                  assignedToId={submission.assignedTo?.id ?? null}
                  internalNote={submission.internalNote}
                  members={members}
                />
              ) : (
                <p className="text-xs text-ink-500">You do not have triage access.</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Linked matter" icon="briefcase" />
            <div className="px-5 py-4 text-xs">
              {submission.matter ? (
                <>
                  <Link href={`/matters/${submission.matter.id}`} className="text-sm font-semibold text-ink-900 hover:underline">
                    {submission.matter.title}
                  </Link>
                  <p className="mt-1 text-ink-500">
                    {submission.matter.county} County
                    {submission.matter.causeNumber ? ` · ${submission.matter.causeNumber}` : ""}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge className="bg-sky-50 text-sky-700">Intake</Badge>
                    <span className="text-[11px] text-ink-400">
                      {MATTER_STATUS_LABELS[submission.matter.status] ?? submission.matter.status}
                    </span>
                  </div>
                  {submission.contact ? (
                    <p className="mt-2 text-[11px] text-ink-400">Client contact: {submission.contact.name}</p>
                  ) : null}
                </>
              ) : (
                <p className="text-ink-500">No matter is linked to this submission.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
