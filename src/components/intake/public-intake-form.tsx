"use client";

import { useState, type FormEvent } from "react";
import { Callout, Field } from "@/components/ui";
import { Icon } from "@/components/icons";
import { apiRequest } from "@/lib/client";
import { INDIANA_COUNTIES, PRACTICE_AREAS } from "@/lib/indiana";

const EMPTY = {
  name: "",
  email: "",
  phone: "",
  organization: "",
  county: "",
  practiceArea: "",
  summary: "",
  opposingParties: "",
  referralSource: "",
};

export function PublicIntakeForm({ token, firmName }: { token: string; firmName: string }) {
  const [form, setForm] = useState(EMPTY);
  const [acknowledged, setAcknowledged] = useState(false);
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<{ reference: string | null } | null>(null);

  const update =
    (key: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const result = await apiRequest<{ reference: string | null }>(`/api/request/${token}`, {
      body: {
        ...form,
        organization: form.organization || null,
        opposingParties: form.opposingParties || null,
        referralSource: form.referralSource || null,
        acknowledged,
        website,
      },
    });

    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess({ reference: result.data.reference ?? null });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (success) {
    return (
      <div className="py-4 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
          <Icon name="check" className="h-6 w-6" />
        </span>
        <h2 className="mt-4 font-serif text-2xl font-semibold text-ink-900">Request received</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-600">
          Thank you, {form.name.split(/\s+/)[0] || "there"}. {firmName} will review your information and contact you
          using the details you provided.
        </p>
        {success.reference ? (
          <div className="mx-auto mt-5 max-w-xs rounded-lg border border-ink-200 bg-ink-50 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">Reference</p>
            <p className="mt-1 font-mono text-sm font-semibold text-ink-800">{success.reference}</p>
          </div>
        ) : null}
        <p className="mx-auto mt-5 max-w-sm text-[11px] leading-relaxed text-ink-500">
          Please do not send additional confidential documents until the firm confirms an engagement.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="relative space-y-5" noValidate>
      {error ? <Callout tone="danger">{error}</Callout> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="intake-name">
          <input
            id="intake-name"
            className="input"
            required
            maxLength={160}
            autoComplete="name"
            value={form.name}
            onChange={update("name")}
            placeholder="Taylor R. Morgan"
          />
        </Field>

        <Field label="Email address" htmlFor="intake-email">
          <input
            id="intake-email"
            type="email"
            className="input"
            required
            maxLength={254}
            autoComplete="email"
            value={form.email}
            onChange={update("email")}
            placeholder="you@example.com"
          />
        </Field>

        <Field label="Phone number" htmlFor="intake-phone">
          <input
            id="intake-phone"
            type="tel"
            className="input"
            required
            maxLength={40}
            autoComplete="tel"
            value={form.phone}
            onChange={update("phone")}
            placeholder="(317) 555-0123"
          />
        </Field>

        <Field label="Organization" htmlFor="intake-organization" hint="Optional">
          <input
            id="intake-organization"
            className="input"
            maxLength={160}
            autoComplete="organization"
            value={form.organization}
            onChange={update("organization")}
            placeholder="Company or entity name"
          />
        </Field>

        <Field label="County" htmlFor="intake-county">
          <select id="intake-county" className="input" required value={form.county} onChange={update("county")}>
            <option value="">Select an Indiana county…</option>
            {INDIANA_COUNTIES.map((county) => (
              <option key={county} value={county}>
                {county}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Practice area" htmlFor="intake-practice-area">
          <select
            id="intake-practice-area"
            className="input"
            required
            value={form.practiceArea}
            onChange={update("practiceArea")}
          >
            <option value="">Select the type of matter…</option>
            {PRACTICE_AREAS.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        label="How can we help?"
        htmlFor="intake-summary"
        hint="A short description helps us screen and route your request. At least 20 characters."
      >
        <textarea
          id="intake-summary"
          className="input min-h-[140px]"
          required
          maxLength={4000}
          value={form.summary}
          onChange={update("summary")}
          placeholder="Describe what happened, when it happened, and what you are looking for."
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Other parties involved"
          htmlFor="intake-opposing"
          hint="Optional — names of opposing parties or companies."
        >
          <input
            id="intake-opposing"
            className="input"
            maxLength={1000}
            value={form.opposingParties}
            onChange={update("opposingParties")}
            placeholder="e.g. Hoosier Logistics Inc., Dana Whitmore"
          />
        </Field>

        <Field label="How did you hear about us?" htmlFor="intake-referral" hint="Optional">
          <input
            id="intake-referral"
            className="input"
            maxLength={160}
            value={form.referralSource}
            onChange={update("referralSource")}
            placeholder="Referral, search, community event…"
          />
        </Field>
      </div>

      <label className="flex items-start gap-2.5 rounded-lg border border-ink-200 bg-ink-50/60 px-4 py-3 text-[11px] leading-relaxed text-ink-600">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-300 accent-ink-900"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
          required
        />
        <span>
          I understand that submitting this form does not create an attorney-client relationship, and that I should not
          send confidential documents through this form.
        </span>
      </label>

      {/* Honeypot — hidden from people and assistive technology. */}
      <div className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor="intake-website">Website</label>
        <input
          id="intake-website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={busy}>
          {busy ? "Submitting…" : "Submit request"}
        </button>
        <p className="text-[10px] leading-relaxed text-ink-400">
          Reviewed confidentially by {firmName}. No account required.
        </p>
      </div>
    </form>
  );
}
