import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { Badge, Callout, Card, CardHeader, EmptyState, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getIntakeSettings, getIntakeSubmissions } from "@/lib/data";
import { can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/dates";
import { CONFLICT_STATUS_LABELS, INTAKE_STATUS_LABELS, cn, titleCase } from "@/lib/utils";

export const metadata = { title: "Intake" };

export default async function IntakeInboxPage() {
  const user = await requireUser();
  if (!can(user.role, "intake:view")) notFound();
  const [submissions, settings] = await Promise.all([getIntakeSubmissions(user), getIntakeSettings(user)]);

  const newCount = submissions.filter((submission) => submission.status === "NEW").length;
  const reviewCount = submissions.filter(
    (submission) => submission.status === "NEW" && submission.conflictStatus === "REVIEW",
  ).length;
  const convertedCount = submissions.filter((submission) => submission.status === "CONVERTED").length;
  const formPath = settings?.enabled && settings.token ? `/request/${settings.token}` : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Client intake"
        title="Intake inbox"
        description="Prospective clients who submitted your public form. Every submission creates an INTAKE matter and a screening snapshot."
        actions={
          <>
            {can(user.role, "intake:configure") ? (
              <Link href="/firm" className="btn btn-secondary">
                <Icon name="settings" className="h-4 w-4" />
                Intake settings
              </Link>
            ) : null}
            {formPath ? (
              <a href={formPath} target="_blank" rel="noreferrer" className="btn btn-primary">
                <Icon name="arrowRight" className="h-4 w-4" />
                Open public form
              </a>
            ) : null}
          </>
        }
      />

      {!settings?.enabled ? (
        <Callout tone="info" title="Public intake is off">
          Enable a private intake link in{" "}
          <Link href="/firm" className="font-semibold underline">
            Firm settings
          </Link>{" "}
          to start accepting prospective client requests. Existing submissions remain available here.
        </Callout>
      ) : null}

      {reviewCount > 0 ? (
        <Callout tone="warning" title={`${reviewCount} submission${reviewCount === 1 ? "" : "s"} need conflict review`}>
          The screening found possible matches in your workspace. Review the flagged details before contacting the
          applicant.
        </Callout>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="New submissions" value={String(newCount)} detail="Not yet contacted" icon="mail" />
        <Stat
          label="Conflict review"
          value={String(reviewCount)}
          detail={reviewCount > 0 ? "Possible matches found" : "No open flags"}
          icon="shield"
          accent={reviewCount > 0 ? "danger" : "default"}
        />
        <Stat label="Converted" value={String(convertedCount)} detail="Engagements accepted" icon="check" />
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="Submissions"
          description={`${submissions.length} total · newest first`}
          icon="mail"
          action={
            settings?.enabled ? (
              <Badge className="bg-emerald-50 text-emerald-700">Form live</Badge>
            ) : (
              <Badge className="bg-ink-100 text-ink-600">Form off</Badge>
            )
          }
        />

        {submissions.length === 0 ? (
          <EmptyState
            icon="mail"
            title="No intake submissions yet"
            description={
              settings?.enabled
                ? "Share your intake link with prospective clients. New requests will appear here automatically."
                : "Enable public intake in Settings to generate a private link."
            }
            action={
              <Link href="/firm" className="btn btn-secondary btn-sm">
                Intake settings
              </Link>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Received</th>
                  <th className="th">Applicant</th>
                  <th className="th hidden md:table-cell">Matter type</th>
                  <th className="th">Conflict</th>
                  <th className="th">Status</th>
                  <th className="th hidden xl:table-cell">Assigned</th>
                  <th className="th hidden lg:table-cell">Matter</th>
                  <th className="th w-8" />
                </tr>
              </thead>
              <tbody>
                {submissions.map((submission) => (
                  <tr key={submission.id} className="group transition hover:bg-ink-50/60">
                    <td className="td whitespace-nowrap text-ink-600">
                      <p className="text-xs">{formatDateTime(submission.createdAt)}</p>
                      <p className="font-mono text-[10px] text-ink-400">{submission.reference}</p>
                    </td>
                    <td className="td">
                      <Link href={`/intake/${submission.id}`} className="font-medium text-ink-900 hover:underline">
                        {submission.name}
                      </Link>
                      <p className="text-[11px] text-ink-500">{submission.email}</p>
                      {submission.organization ? (
                        <p className="text-[11px] text-ink-400">{submission.organization}</p>
                      ) : null}
                    </td>
                    <td className="td hidden md:table-cell text-ink-600">
                      <p className="text-xs">{submission.practiceArea}</p>
                      <p className="text-[11px] text-ink-400">{submission.county} County</p>
                    </td>
                    <td className="td">
                      <span
                        className={cn(
                          "badge",
                          submission.conflictStatus === "REVIEW"
                            ? "bg-red-50 text-red-700"
                            : "bg-emerald-50 text-emerald-700",
                        )}
                      >
                        {CONFLICT_STATUS_LABELS[submission.conflictStatus] ?? titleCase(submission.conflictStatus)}
                      </span>
                    </td>
                    <td className="td">
                      <StatusBadge
                        status={submission.status}
                        label={INTAKE_STATUS_LABELS[submission.status] ?? titleCase(submission.status)}
                      />
                    </td>
                    <td className="td hidden xl:table-cell text-xs text-ink-600">
                      {submission.assignedToName ?? <span className="text-ink-400">Unassigned</span>}
                    </td>
                    <td className="td hidden lg:table-cell">
                      {submission.matterId ? (
                        <Link href={`/matters/${submission.matterId}`} className="text-xs text-ink-600 hover:underline">
                          {submission.matterTitle}
                        </Link>
                      ) : (
                        <span className="text-xs text-ink-400">—</span>
                      )}
                    </td>
                    <td className="td">
                      <Link href={`/intake/${submission.id}`} aria-label={`Review ${submission.name}`}>
                        <Icon name="arrowRight" className="h-4 w-4 text-ink-300 group-hover:text-ink-700" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-[11px] text-ink-400">
        Conflict results are internal snapshots taken at submission time; they are never shown to the applicant. IP
        addresses are stored only as salted hashes.
      </p>
    </div>
  );
}
