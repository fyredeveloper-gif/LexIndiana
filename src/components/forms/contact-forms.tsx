"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Callout, Field } from "@/components/ui";
import { apiRequest } from "@/lib/client";

export type ContactFormValues = {
  id: string;
  type: string;
  name: string;
  aliases: string[];
  email: string | null;
  phone: string | null;
  organization: string | null;
  address: string | null;
  notes: string | null;
};

export function ContactForm({
  contact,
  onDone,
}: {
  contact?: ContactFormValues;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    type: contact?.type ?? "CLIENT",
    name: contact?.name ?? "",
    aliases: contact?.aliases.join(", ") ?? "",
    email: contact?.email ?? "",
    phone: contact?.phone ?? "",
    organization: contact?.organization ?? "",
    address: contact?.address ?? "",
    notes: contact?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);

    const payload = {
      ...form,
      aliases: form.aliases,
      email: form.email || null,
      phone: form.phone || null,
      organization: form.organization || null,
      address: form.address || null,
      notes: form.notes || null,
    };

    const result = contact
      ? await apiRequest(`/api/contacts/${contact.id}`, { method: "PATCH", body: payload })
      : await apiRequest("/api/contacts", { body: payload });

    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(true);
    if (!contact) setForm({ ...form, name: "", aliases: "", email: "", phone: "", organization: "", address: "", notes: "" });
    router.refresh();
    onDone?.();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error ? <Callout tone="danger">{error}</Callout> : null}
      {saved ? <Callout tone="success">Contact saved.</Callout> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contact type" htmlFor="contact-type">
          <select id="contact-type" className="input" value={form.type} onChange={update("type")}>
            <option value="CLIENT">Client</option>
            <option value="OPPOSING_PARTY">Opposing party</option>
            <option value="OPPOSING_COUNSEL">Opposing counsel</option>
            <option value="WITNESS">Witness</option>
          </select>
        </Field>

        <Field label="Full name" htmlFor="contact-name">
          <input
            id="contact-name"
            className="input"
            required
            maxLength={160}
            value={form.name}
            onChange={update("name")}
            placeholder="Dana R. Whitmore"
          />
        </Field>

        <Field
          label="Aliases / alternate names"
          htmlFor="contact-aliases"
          hint="Comma separated — included in conflict checks."
          className="sm:col-span-2"
        >
          <input
            id="contact-aliases"
            className="input"
            maxLength={600}
            value={form.aliases}
            onChange={update("aliases")}
            placeholder="Dan Whitmore, D. Whitmore, Whitmore Holdings LLC"
          />
        </Field>

        <Field label="Email" htmlFor="contact-email">
          <input
            id="contact-email"
            type="email"
            className="input"
            value={form.email}
            onChange={update("email")}
            placeholder="dana@example.com"
          />
        </Field>

        <Field label="Phone" htmlFor="contact-phone">
          <input
            id="contact-phone"
            className="input"
            value={form.phone}
            onChange={update("phone")}
            placeholder="(317) 555-0142"
          />
        </Field>

        <Field label="Organization" htmlFor="contact-organization">
          <input
            id="contact-organization"
            className="input"
            maxLength={160}
            value={form.organization}
            onChange={update("organization")}
            placeholder="Whitmore Holdings LLC"
          />
        </Field>

        <Field label="Address" htmlFor="contact-address">
          <input
            id="contact-address"
            className="input"
            maxLength={400}
            value={form.address}
            onChange={update("address")}
            placeholder="123 N. Meridian St., Indianapolis, IN 46204"
          />
        </Field>
      </div>

      <Field label="Notes" htmlFor="contact-notes" hint="Searchable in conflict checks.">
        <textarea
          id="contact-notes"
          className="input min-h-[80px]"
          maxLength={4000}
          value={form.notes}
          onChange={update("notes")}
          placeholder="Adverse in a 2024 contract dispute; related to Whitmore Logistics."
        />
      </Field>

      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Saving…" : contact ? "Save contact" : "Add contact"}
      </button>
    </form>
  );
}
