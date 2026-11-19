import type { Metadata } from "next";
import Link from "next/link";
import { JoinForm } from "@/components/forms/join-form";
import { Icon } from "@/components/icons";
import { getSessionUser } from "@/lib/auth";
import { getInvitationByToken } from "@/lib/firm";
import { STAFF_ROLE_DESCRIPTIONS, STAFF_ROLE_LABELS, can } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Join firm", robots: { index: false, follow: false } };

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await getInvitationByToken(token);
  const session = await getSessionUser();

  if (!invitation) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper px-5">
        <div className="card max-w-md px-6 py-8 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-ink-900 text-brass-300">
            <Icon name="shield" className="h-5 w-5" />
          </span>
          <h1 className="mt-4 font-serif text-xl font-semibold text-ink-900">Invitation unavailable</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            This invitation is invalid, expired, or has already been used. Ask the firm owner for a new link.
          </p>
          <Link href="/login" className="btn btn-secondary mt-5">
            Go to sign in
          </Link>
        </div>
      </main>
    );
  }

  const emailMatches = session?.email.toLowerCase() === invitation.email.toLowerCase();

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-5 py-10">
      <div className="card w-full max-w-lg overflow-hidden">
        <header className="bg-ink-950 px-6 py-6 text-white">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brass-500 text-ink-950">
              <Icon name="scale" className="h-5 w-5" />
            </span>
            <div>
              <p className="font-serif text-lg font-semibold">{invitation.firm.name}</p>
              <p className="text-[10px] uppercase tracking-[0.16em] text-ink-400">Staff invitation</p>
            </div>
          </div>
        </header>

        <div className="space-y-4 px-6 py-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">You were invited as</p>
            <p className="mt-1 text-lg font-semibold text-ink-900">{STAFF_ROLE_LABELS[invitation.role]}</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-600">{STAFF_ROLE_DESCRIPTIONS[invitation.role]}</p>
          </div>

          <div className="rounded-lg bg-ink-50 px-4 py-3 text-xs text-ink-600">
            Invitation for <span className="font-medium text-ink-800">{invitation.email}</span>. Expires{" "}
            {invitation.expiresAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.
          </div>

          {session ? (
            <div className="space-y-3">
              {emailMatches ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
                  You are signed in as {session.email}, which is already a member of {session.firmName}. This version
                  supports one firm per user; sign out and use a different account to accept.
                </div>
              ) : (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-relaxed text-red-800">
                  This invitation was sent to {invitation.email}, but you are signed in as {session.email}. Sign out and
                  open the link again.
                </div>
              )}
              <Link href="/dashboard" className="btn btn-secondary w-full">
                Return to your firm
              </Link>
            </div>
          ) : (
            <JoinForm token={token} email={invitation.email} firmName={invitation.firm.name} />
          )}

          <p className="text-[11px] leading-relaxed text-ink-400">
            Accepting joins this firm&apos;s workspace with the role above. Access is limited by role; consultants also
            need each matter shared with them.
          </p>
        </div>
      </div>
    </main>
  );
}
