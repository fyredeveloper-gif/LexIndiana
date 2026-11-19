import { notFound } from "next/navigation";
import { FirmMembersPanel, FirmProfileForm } from "@/components/forms/firm-admin";
import { IntakeSettingsPanel } from "@/components/forms/intake-settings";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getIntakeSettings } from "@/lib/data";
import { getAuditEntries, getFirmMembers, getFirmProfile, getPendingInvitations } from "@/lib/firm";
import { STAFF_ROLE_LABELS, can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/dates";

export const metadata = { title: "Firm" };

const AUDIT_LABELS: Record<string, string> = {
  "member.invited": "Invitation created",
  "member.role_changed": "Role changed",
  "member.removed": "Member removed",
  "member.joined": "Member joined",
  "ownership.transferred": "Ownership transferred",
  "intake.status_changed": "Intake status changed",
  "intake.assigned": "Intake assigned",
  "intake.note_updated": "Intake note updated",
  "intake.token_rotated": "Intake link rotated",
  "intake.settings_changed": "Intake settings changed",
  "conflict.reviewed": "Conflict reviewed",
  "matter.access_granted": "Consultant access granted",
  "matter.access_revoked": "Consultant access revoked",
};

export default async function FirmPage() {
  const user = await requireUser();
  const canViewMembers = can(user.role, "members:view");
  const canEditProfile = can(user.role, "firm:profile");
  if (!canViewMembers && !canEditProfile) notFound();

  const [firm, members, invitations, audit, intake] = await Promise.all([
    getFirmProfile(user.firmId),
    getFirmMembers(user.firmId),
    can(user.role, "members:manage") ? getPendingInvitations(user.firmId) : Promise.resolve([]),
    can(user.role, "audit:view") ? getAuditEntries(user.firmId, 40) : Promise.resolve([]),
    can(user.role, "intake:configure") ? getIntakeSettings(user) : Promise.resolve(null),
  ]);
  if (!firm) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Firm administration"
        title={firm.name}
        description={`One workspace, role-based access. You are signed in as ${STAFF_ROLE_LABELS[user.role]}.`}
        actions={<Badge className="bg-brass-50 text-brass-700">{STAFF_ROLE_LABELS[user.role]}</Badge>}
      />

      <Card>
        <CardHeader
          title="Firm profile"
          description="Used on pleadings, generated documents, and invoice headers"
          icon="briefcase"
        />
        <div className="px-5 py-5">
          <FirmProfileForm
            profile={{ name: firm.name, address: firm.address, phone: firm.phone, email: firm.email }}
            canEdit={canEditProfile}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Team & roles"
          description={
            can(user.role, "members:manage")
              ? "Invite staff, change roles, or transfer ownership"
              : "The firm roster is visible to practice managers; only the owner can change roles"
          }
          icon="users"
          action={<Badge className="bg-ink-100 text-ink-600">{members.length} member{members.length === 1 ? "" : "s"}</Badge>}
        />
        <FirmMembersPanel
          members={members.map((member) => ({
            ...member,
            role: member.role as "OWNER" | "ATTORNEY" | "PARALEGAL" | "CLM" | "CONSULTANT",
          }))}
          invitations={invitations.map((invitation) => ({
            ...invitation,
            role: invitation.role as "OWNER" | "ATTORNEY" | "PARALEGAL" | "CLM" | "CONSULTANT",
          }))}
          currentUserId={user.id}
          canManage={can(user.role, "members:manage")}
        />
      </Card>

      {intake ? (
        <Card>
          <CardHeader
            title="Public client intake"
            description="One private link for this firm. Submissions create an INTAKE matter and are screened for conflicts."
            icon="mail"
          />
          <div className="px-5 py-5">
            <IntakeSettingsPanel
              enabled={intake.enabled}
              token={intake.token}
              headline={intake.headline}
              intro={intake.intro}
              total={intake.total}
              newCount={intake.newCount}
              reviewCount={intake.reviewCount}
              appUrl={process.env.APP_URL ?? "http://localhost:3000"}
            />
          </div>
        </Card>
      ) : null}

      {can(user.role, "audit:view") ? (
        <Card>
          <CardHeader
            title="Activity log"
            description="Membership, intake, conflict-review, and access events"
            icon="shield"
          />
          <ul className="divide-y divide-ink-100">
            {audit.length === 0 ? (
              <li className="px-5 py-4 text-xs text-ink-500">No security events recorded yet.</li>
            ) : (
              audit.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center gap-2 px-5 py-2.5 text-xs">
                  <span className="font-medium text-ink-800">{AUDIT_LABELS[entry.action] ?? entry.action}</span>
                  <span className="text-ink-400">· {entry.actorName}</span>
                  <span className="ml-auto text-[11px] text-ink-400">{formatDateTime(entry.createdAt)}</span>
                </li>
              ))
            )}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
