"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Callout, Field } from "@/components/ui";
import { Icon } from "@/components/icons";
import { apiRequest } from "@/lib/client";

export type ProfileValues = {
  name: string;
  email: string;
  indianaAttorneyNumber: string | null;
  defaultHourlyRate: number;
};

export function ProfileForm({ profile }: { profile: ProfileValues }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: profile.name,
    indianaAttorneyNumber: profile.indianaAttorneyNumber ?? "",
    defaultHourlyRate: String(profile.defaultHourlyRate),
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const result = await apiRequest("/api/settings", {
      method: "PATCH",
      body: { ...form, defaultHourlyRate: Number(form.defaultHourlyRate) },
    });
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
      {saved ? <Callout tone="success">Profile saved. New invoices and pleadings will use these details.</Callout> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Attorney name" htmlFor="profile-name">
          <input id="profile-name" className="input" required maxLength={120} value={form.name} onChange={update("name")} />
        </Field>
        <Field label="Indiana attorney number" htmlFor="profile-attorney-number" hint="Printed on pleadings and invoices.">
          <input
            id="profile-attorney-number"
            className="input font-mono text-[13px]"
            maxLength={24}
            value={form.indianaAttorneyNumber}
            onChange={update("indianaAttorneyNumber")}
            placeholder="34567-12"
          />
        </Field>
        <Field label="Default hourly rate (USD)" htmlFor="profile-rate" hint="Used for timers and new time entries.">
          <input
            id="profile-rate"
            type="number"
            min={0}
            max={5000}
            step={0.01}
            className="input"
            value={form.defaultHourlyRate}
            onChange={update("defaultHourlyRate")}
          />
        </Field>
      </div>

      <div className="rounded-lg bg-ink-50 px-4 py-3 text-[11px] text-ink-500">
        Sign-in email: <span className="font-medium text-ink-700">{profile.email}</span> · Firm name, address, phone,
        and email are managed by the owner or practice manager under Firm.
      </div>

      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}

export function TwoFactorManager({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [setup, setSetup] = useState<{ qrDataUrl: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const begin = async () => {
    setBusy(true);
    setError(null);
    const result = await apiRequest<{ qrDataUrl: string; secret: string }>("/api/auth/2fa/setup", { body: {} });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSetup(result.data);
  };

  const enable = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await apiRequest("/api/auth/2fa/enable", { body: { code } });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSetup(null);
    setCode("");
    router.refresh();
  };

  const disable = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await apiRequest("/api/auth/2fa/disable", { body: { password } });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPassword("");
    router.refresh();
  };

  if (enabled) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800">
          <Icon name="shield" className="h-4 w-4" />
          Two-factor authentication is enabled for this account.
        </div>
        {error ? <Callout tone="danger">{error}</Callout> : null}
        <form onSubmit={disable} className="space-y-3">
          <Field label="Confirm password to disable" htmlFor="disable-2fa-password">
            <input
              id="disable-2fa-password"
              type="password"
              className="input"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </Field>
          <button type="submit" className="btn btn-danger btn-sm" disabled={busy}>
            {busy ? "Disabling…" : "Disable two-factor authentication"}
          </button>
        </form>
      </div>
    );
  }

  if (!setup) {
    return (
      <div className="space-y-3">
        <p className="text-xs leading-relaxed text-ink-500">
          Add a second factor with any TOTP authenticator app (1Password, Google Authenticator, Authy). Codes are
          verified server-side with a one-step clock window.
        </p>
        {error ? <Callout tone="danger">{error}</Callout> : null}
        <button type="button" onClick={begin} className="btn btn-secondary" disabled={busy}>
          <Icon name="shield" className="h-4 w-4" />
          {busy ? "Preparing…" : "Set up two-factor authentication"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <Callout tone="danger">{error}</Callout> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={setup.qrDataUrl} alt="Two-factor enrollment QR code" className="h-[150px] w-[150px] rounded-lg border border-ink-200 bg-white p-1.5" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-ink-700">Scan the QR code, or enter this secret manually:</p>
          <code className="mt-1 block break-all rounded-md bg-ink-50 px-3 py-2 font-mono text-[11px] text-ink-700">
            {setup.secret}
          </code>
        </div>
      </div>
      <form onSubmit={enable} className="flex flex-wrap items-end gap-3">
        <Field label="6-digit code" htmlFor="enable-2fa-code">
          <input
            id="enable-2fa-code"
            className="input w-[160px] font-mono tracking-[0.3em]"
            inputMode="numeric"
            maxLength={6}
            required
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
          />
        </Field>
        <button type="submit" className="btn btn-primary" disabled={busy || code.length !== 6}>
          {busy ? "Verifying…" : "Verify and enable"}
        </button>
      </form>
    </div>
  );
}
