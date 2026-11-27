import Link from "next/link";
import { ProfileForm, TwoFactorManager } from "@/components/forms/settings-tools";
import { Icon } from "@/components/icons";
import { Badge, Card, CardHeader, PageHeader, SectionRow } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/dates";
import { STAFF_ROLE_LABELS, can } from "@/lib/permissions";
import { storageDriver } from "@/lib/storage";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const profile = await getProfile(user);
  if (!profile) return null;

  const drive = storageDriver();
  const canSeeFirm = can(user.role, "members:view") || can(user.role, "firm:profile");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Settings"
        description="Your personal details populate Indiana court pleadings, generated documents, and invoice headers."
        actions={
          <>
            <Link href="/settings/desktop" className="btn btn-secondary">
              Desktop settings
            </Link>
            {canSeeFirm ? (
              <Link href="/firm" className="btn btn-secondary">
                <Icon name="users" className="h-4 w-4" />
                Firm & team
              </Link>
            ) : null}
          </>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Attorney profile" icon="briefcase" />
          <div className="px-5 py-5">
            <ProfileForm
              profile={{
                name: profile.name,
                email: profile.email,
                indianaAttorneyNumber: profile.indianaAttorneyNumber,
                defaultHourlyRate: profile.defaultHourlyRate,
              }}
            />
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Two-factor authentication" icon="shield" />
            <div className="px-5 py-5">
              <TwoFactorManager enabled={profile.twoFactorEnabled} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Firm membership" icon="scale" />
            <dl className="px-5 py-2">
              <SectionRow label="Firm">{profile.firmName}</SectionRow>
              <SectionRow label="Role">
                <Badge className="bg-brass-50 text-brass-700">{STAFF_ROLE_LABELS[user.role]}</Badge>
              </SectionRow>
              <SectionRow label="Sign-in email">{profile.email}</SectionRow>
              <SectionRow label="Member since">{formatDate(profile.createdAt.slice(0, 10))}</SectionRow>
              <SectionRow label="Default rate">{formatMoney(profile.defaultHourlyRate)} / hour</SectionRow>
              <SectionRow label="Firm id">
                <code className="font-mono text-[11px] text-ink-600" title={user.firmId}>
                  {user.firmId.slice(0, 10)}…{user.firmId.slice(-6)}
                </code>
              </SectionRow>
              <SectionRow label="Storage">
                <span className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-ink-100 text-ink-600">{drive === "s3" ? "S3-compatible" : "Local filesystem"}</Badge>
                  <code className="font-mono text-[11px] text-ink-600">firms/{user.firmId.slice(0, 6)}…/</code>
                </span>
              </SectionRow>
            </dl>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader title="Isolation, roles & security" description="How this firm's data is protected" icon="shield" />
        <div className="grid gap-5 px-5 py-5 sm:grid-cols-3">
          {[
            {
              icon: "users",
              title: "Firm-level tenancy",
              copy: "Every contact, matter, time entry, invoice, deadline, and document carries the firm id from your membership. Queries never accept a firm or user id from the request.",
            },
            {
              icon: "template",
              title: "Firm-scoped storage",
              copy: "Uploads and generated files live under firms/{firm id}/matters/{matter id}/. Keys are re-verified before every read, so a tampered record cannot escape the firm prefix.",
            },
            {
              icon: "shield",
              title: "Role checks + 2FA",
              copy: "Each page and API route checks a role capability, and consultants need an explicit matter grant. Passwords use bcrypt (cost 12); optional TOTP adds a second factor.",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-lg border border-ink-100 bg-ink-50/50 px-4 py-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-ink-700 shadow-sm">
                <Icon name={item.icon} className="h-4 w-4" />
              </span>
              <p className="mt-2.5 text-sm font-semibold text-ink-900">{item.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-600">{item.copy}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
