"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Callout, Field } from "@/components/ui";
import { apiRequest } from "@/lib/client";
import { CONTACT_TYPE_LABELS } from "@/lib/utils";

export type ClientOption = { id: string; name: string };

export type MatterFormValues = {
  id: string;
  clientId: string;
  title: string;
  causeNumber: string | null;
  county: string;
  courtName: string | null;
  practiceArea: string;
  status: string;
  notes: string | null;
};

const EMPTY = {
  clientId: "",
  title: "",
  causeNumber: "",
  county: "",
  courtName: "",
  practiceArea: "",
  status: "INTAKE",
  notes: "",
};

export function MatterForm({
  clients,
  matter,
  onCancel,
}: {
  clients: ClientOption[];
  matter?: MatterFormValues;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState(
    matter
      ? {
          clientId: matter.clientId,
          title: matter.title,
          causeNumber: matter.causeNumber ?? "",
          county: matter.county,
          courtName: matter.courtName ?? "",
          practiceArea: matter.practiceArea,
          status: matter.status,
          notes: matter.notes ?? "",
        }
      : EMPTY,
  );
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
      causeNumber: form.causeNumber || null,
      courtName: form.courtName || null,
      notes: form.notes || null,
    };

    const result = matter
      ? await apiRequest<{ ok: boolean }>(`/api/matters/${matter.id}`, { method: "PATCH", body: payload })
      : await apiRequest<{ ok: boolean; id: string }>("/api/matters", { body: payload });

    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    if (!matter && "id" in result.data) {
      router.push(`/matters/${result.data.id}`);
      router.refresh();
      return;
    }
    setSaved(true);
    router.refresh();
    onCancel?.();
  };

  if (clients.length === 0) {
    return (
      <Callout tone="warning" title="Add a client first">
        Matters must be tied to a client contact. Create a contact of type &ldquo;Client&rdquo; on the Contacts page,
        then open the matter here.
      </Callout>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error ? <Callout tone="danger">{error}</Callout> : null}
      {saved ? <Callout tone="success">Matter saved.</Callout> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Primary client" htmlFor="clientId">
          <select id="clientId" className="input" required value={form.clientId} onChange={update("clientId")}>
            <option value="">Select a client…</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Matter title" htmlFor="title">
          <input
            id="title"
            className="input"
            required
            maxLength={200}
            value={form.title}
            onChange={update("title")}
            placeholder="Smith v. Hoosier Logistics"
          />
        </Field>

        <Field label="Indiana cause number" htmlFor="causeNumber" hint="e.g. 49D01-2601-CT-001234">
          <input
            id="causeNumber"
            className="input font-mono text-[13px]"
            maxLength={40}
            value={form.causeNumber}
            onChange={update("causeNumber")}
            placeholder="49D01-2601-CT-001234"
          />
        </Field>

        <Field label="County" htmlFor="county">
          <input
            id="county"
            className="input"
            required
            maxLength={80}
            value={form.county}
            onChange={update("county")}
            placeholder="Marion"
          />
        </Field>

        <Field label="Court" htmlFor="courtName">
          <input
            id="courtName"
            className="input"
            maxLength={200}
            value={form.courtName}
            onChange={update("courtName")}
            placeholder="Marion Superior Court, Civil Division 1"
          />
        </Field>

        <Field label="Practice area" htmlFor="practiceArea">
          <input
            id="practiceArea"
            className="input"
            required
            maxLength={80}
            value={form.practiceArea}
            onChange={update("practiceArea")}
            placeholder="Civil Litigation"
            list="practice-areas"
          />
          <datalist id="practice-areas">
            {["Civil Litigation", "Family Law", "Criminal Defense", "Estate Planning", "Business Law", "Real Estate", "Personal Injury", "Immigration"].map(
              (area) => (
                <option key={area} value={area} />
              ),
            )}
          </datalist>
        </Field>

        <Field label="Status" htmlFor="status">
          <select id="status" className="input" value={form.status} onChange={update("status")}>
            <option value="INTAKE">Intake</option>
            <option value="ACTIVE">Active</option>
            <option value="PENDING">Pending</option>
            <option value="CLOSED">Closed</option>
          </select>
        </Field>
      </div>

      <Field label="Matter notes" htmlFor="notes">
        <textarea
          id="notes"
          className="input min-h-[90px]"
          maxLength={8000}
          value={form.notes}
          onChange={update("notes")}
          placeholder="Scope, key facts, referral source, conflicts cleared on…"
        />
      </Field>

      <div className="flex items-center gap-2">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : matter ? "Save changes" : "Open matter"}
        </button>
        {onCancel ? (
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function PartyForm({
  matterId,
  contacts,
}: {
  matterId: string;
  contacts: Array<{ id: string; name: string; type: string }>;
}) {
  const router = useRouter();
  const [contactId, setContactId] = useState("");
  const [role, setRole] = useState("OPPOSING_PARTY");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await apiRequest(`/api/matters/${matterId}/parties`, { body: { contactId, role } });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setContactId("");
    router.refresh();
  };

  if (contacts.length === 0) {
    return <p className="text-xs text-ink-500">Add contacts to your workspace to link parties to this matter.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {error ? <Callout tone="danger">{error}</Callout> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="party-contact">
            Contact
          </label>
          <select
            id="party-contact"
            className="input"
            required
            value={contactId}
            onChange={(event) => setContactId(event.target.value)}
          >
            <option value="">Select contact…</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.name} ({CONTACT_TYPE_LABELS[contact.type] ?? contact.type})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="party-role">
            Role on this matter
          </label>
          <select id="party-role" className="input" value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="OPPOSING_PARTY">Opposing party</option>
            <option value="OPPOSING_COUNSEL">Opposing counsel</option>
            <option value="WITNESS">Witness</option>
            <option value="CLIENT">Additional client contact</option>
          </select>
        </div>
      </div>
      <button type="submit" className="btn btn-secondary btn-sm" disabled={busy || !contactId}>
        {busy ? "Linking…" : "Link party"}
      </button>
    </form>
  );
}
