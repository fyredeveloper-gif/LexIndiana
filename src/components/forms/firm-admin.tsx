"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Callout, Field } from "@/components/ui";
import { Icon } from "@/components/icons";
import { apiRequest } from "@/lib/client";
import { STAFF_ROLE_DESCRIPTIONS, STAFF_ROLE_LABELS } from "@/lib/permissions";
import { formatDate } from "@/lib/dates";

type Role = "OWNER" | "ATTORNEY" | "PARALEGAL" | "CLM" | "CONSULTANT";

const INVITABLE_ROLES = ["ATTORNEY", "PARALEGAL", "CLM", "CONSULTANT"] as const;

export type FirmProfileValues = {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
};

export function FirmProfileForm({
  profile,
  canEdit,
}: {
  profile: FirmProfileValues;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: profile.name,
    address: profile.address ?? "",
    phone: profile.phone ?? "",
    email: profile.email ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const update =
    (key: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const result = await apiRequest("/api/firm", { method: "PATCH", body: form });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error ? <Callout tone="danger">{error}</Callout> : null}
      {saved ? <Callout tone="success">Firm details saved. New invoices and pleadings will use them.</Callout> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Firm name" htmlFor="firm-name" className="sm:col-span-2">
          <input
            id="firm-name"
            className="input"
            required
            maxLength={160}
            value={form.name}
            onChange={update("name")}
            disabled={!canEdit}
          />
        </Field>
        <Field label="Address" htmlFor="firm-address" className="sm:col-span-2">
          <input
            id="firm-address"
            className="input"
            maxLength={400}
            value={form.address}
            onChange={update("address")}
            disabled={!canEdit}
            placeholder="111 Monument Circle, Suite 2500, Indianapolis, IN 46204"
          />
        </Field>
        <Field label="Phone" htmlFor="firm-phone">
          <input
            id="firm-phone"
            className="input"
            maxLength={40}
            value={form.phone}
            onChange={update("phone")}
            disabled={!canEdit}
          />
        </Field>
        <Field label="Email" htmlFor="firm-email">
          <input
            id="firm-email"
            type="email"
            className="input"
            maxLength={254}
            value={form.email}
            onChange={update("email")}
            disabled={!canEdit}
          />
        </Field>
      </div>
      {canEdit ? (
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save firm profile"}
        </button>
      ) : (
        <p className="text-[11px] text-ink-400">Only the owner or practice manager can edit firm details.</p>
      )}
    </form>
  );
}

export type FirmMemberValues = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  title: string | null;
  joinedAt: string;
};

export type FirmInvitationValues = {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
};

export function FirmMembersPanel({
  members,
  invitations,
  currentUserId,
  canManage,
}: {
  members: FirmMemberValues[];
  invitations: FirmInvitationValues[];
  currentUserId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<Role, "OWNER">>("PARALEGAL");
  const [title, setTitle] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [transferTo, setTransferTo] = useState("");
  const [copied, setCopied] = useState(false);
  const transferCandidates = members.filter(
    (member) => member.userId !== currentUserId && member.role === "ATTORNEY",
  );

  const run = async (
    key: string,
    url: string,
    method: "POST" | "PATCH" | "DELETE",
    body?: unknown,
    confirmText?: string,
  ) => {
    if (confirmText && !window.confirm(confirmText)) return false;
    setBusy(key);
    setError(null);
    setNotice(null);
    const result = await apiRequest(url, { method, body: body ?? {} });
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    router.refresh();
    return true;
  };

  // Create the invitation and keep the one-time link from the same response.
  const createInvite = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("invite");
    setError(null);
    setNotice(null);
    const response = await apiRequest<{ url: string }>("/api/firm/invitations", {
      method: "POST",
      body: { email, role, title: title || null },
    });
    setBusy(null);
    if (!response.ok) {
      setError(response.error);
      return;
    }
    setInviteLink(new URL(response.data.url, window.location.origin).toString());
    setEmail("");
    setTitle("");
    setNotice("Invitation created. Copy the link now — it is shown only once.");
    router.refresh();
  };

  const copy = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copy failed — select the link and copy it manually.");
    }
  };

  return (
    <div className="space-y-5">
      {error ? <Callout tone="danger">{error}</Callout> : null}
      {notice ? <Callout tone="success">{notice}</Callout> : null}

      <ul className="divide-y divide-ink-100">
        {members.map((member) => {
          const self = member.userId === currentUserId;
          return (
            <li key={member.membershipId} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink-900">
                  {member.name}
                  {self ? <span className="ml-2 text-[11px] font-normal text-ink-400">You</span> : null}
                </p>
                <p className="text-[11px] text-ink-500">
                  {member.email}
                  {member.title ? ` · ${member.title}` : ""} · joined {formatDate(member.joinedAt.slice(0, 10))}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-400">{STAFF_ROLE_DESCRIPTIONS[member.role]}</p>
              </div>
              {canManage && !self && member.role !== "OWNER" ? (
                <select
                  className="input w-[150px] text-xs"
                  value={member.role}
                  onChange={(event) =>
                    run(`role-${member.membershipId}`, `/api/firm/members/${member.membershipId}`, "PATCH", {
                      role: event.target.value,
                    })
                  }
                  disabled={busy === `role-${member.membershipId}`}
                  aria-label={`Role for ${member.name}`}
                >
                  {INVITABLE_ROLES.map((option) => (
                    <option key={option} value={option}>
                      {STAFF_ROLE_LABELS[option]}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="badge bg-ink-100 text-ink-600">{STAFF_ROLE_LABELS[member.role]}</span>
              )}
              {canManage && !self && member.role !== "OWNER" ? (
                <button
                  type="button"
                  className="text-[11px] font-medium text-ink-400 hover:text-red-600"
                  disabled={busy === `remove-${member.membershipId}`}
                  onClick={() =>
                    run(
                      `remove-${member.membershipId}`,
                      `/api/firm/members/${member.membershipId}`,
                      "DELETE",
                      undefined,
                      `Remove ${member.name} from the firm? Their workspace access ends immediately.`,
                    )
                  }
                >
                  Remove
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {canManage ? (
        <div className="space-y-5 border-t border-ink-100 px-5 py-4">
          <form onSubmit={createInvite} className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Invite a team member</p>
            <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-end">
              <Field label="Email" htmlFor="invite-email">
                <input
                  id="invite-email"
                  type="email"
                  className="input"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="paralegal@firm.example"
                />
              </Field>
              <Field label="Role" htmlFor="invite-role">
                <select
                  id="invite-role"
                  className="input"
                  value={role}
                  onChange={(event) => setRole(event.target.value as Exclude<Role, "OWNER">)}
                >
                  {INVITABLE_ROLES.map((option) => (
                    <option key={option} value={option}>
                      {STAFF_ROLE_LABELS[option]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Title (optional)" htmlFor="invite-title">
                <input
                  id="invite-title"
                  className="input"
                  maxLength={80}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Senior paralegal"
                />
              </Field>
              <button type="submit" className="btn btn-primary" disabled={busy === "invite"}>
                {busy === "invite" ? "Creating…" : "Create invite link"}
              </button>
            </div>
          </form>

          {inviteLink ? (
            <div>
              <label className="label" htmlFor="invite-link">
                One-time invitation link
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="invite-link"
                  readOnly
                  value={inviteLink}
                  className="input font-mono text-[11px]"
                  onFocus={(event) => event.target.select()}
                />
                <button type="button" className="btn btn-secondary btn-sm whitespace-nowrap" onClick={copy}>
                  <Icon name="shield" className="h-3.5 w-3.5" />
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-ink-400">
                Send this over a trusted channel. It expires in 7 days, works once, and is shown only now.
              </p>
            </div>
          ) : null}

          {invitations.length > 0 ? (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Pending invitations</p>
              <ul className="space-y-1.5">
                {invitations.map((invitation) => (
                  <li
                    key={invitation.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-100 px-3 py-2 text-xs"
                  >
                    <span className="text-ink-700">
                      {invitation.email} · {STAFF_ROLE_LABELS[invitation.role]}
                      <span className="text-ink-400">
                        {" "}
                        · expires {formatDate(invitation.expiresAt.slice(0, 10))}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="text-[11px] font-medium text-ink-400 hover:text-red-600"
                      onClick={() => run(`revoke-${invitation.id}`, `/api/firm/invitations/${invitation.id}`, "DELETE")}
                      disabled={busy === `revoke-${invitation.id}`}
                    >
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">Transfer ownership</p>
            {transferCandidates.length === 0 ? (
              <div
                className="mt-2 rounded-lg border border-amber-200 bg-white/70 px-3 py-2.5 text-xs leading-relaxed text-amber-900"
                role="status"
              >
                <p className="font-semibold">No eligible team member yet.</p>
                <p className="mt-0.5">
                  {members.length === 1
                    ? "Invite an attorney above to enable ownership transfer."
                    : "Ownership can only be transferred to an attorney. Change a team member's role to Attorney above."}
                </p>
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <select
                  className="input w-[220px] text-xs"
                  value={transferTo}
                  onChange={(event) => setTransferTo(event.target.value)}
                  aria-label="New owner"
                >
                  <option value="">Select a team member…</option>
                  {transferCandidates.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.name} · {STAFF_ROLE_LABELS[member.role]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={!transferTo || busy === "transfer"}
                  onClick={async () => {
                    const ok = await run(
                      "transfer",
                      "/api/firm/ownership",
                      "POST",
                      { userId: transferTo },
                      "Transfer ownership? You will become an attorney and lose firm administration access.",
                    );
                    if (ok) setTransferTo("");
                  }}
                >
                  {busy === "transfer" ? "Transferring…" : "Transfer ownership"}
                </button>
              </div>
            )}
            <p className="mt-1.5 text-[11px] leading-relaxed text-amber-800">
              There is exactly one owner. Transfer deliberately; it cannot be undone without the new owner.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
