"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Callout, Field } from "@/components/ui";
import { Icon } from "@/components/icons";
import { apiRequest } from "@/lib/client";
import { formatDate, formatMoney, todayISO } from "@/lib/dates";

type UnbilledEntry = {
  id: string;
  description: string;
  workDate: string;
  hours: number;
  amount: number;
  matterId: string;
  matterTitle: string;
  clientName: string;
};

export type UnbilledGroup = {
  matterId: string;
  matterTitle: string;
  clientName: string;
  minutes: number;
  value: number;
  entries: UnbilledEntry[];
};

export function InvoiceBuilder({ groups }: { groups: UnbilledGroup[] }) {
  const router = useRouter();
  const [matterId, setMatterId] = useState(groups[0]?.matterId ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [issueDate, setIssueDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const group = useMemo(() => groups.find((entry) => entry.matterId === matterId), [groups, matterId]);
  const chosenEntries = useMemo(
    () => (group ? group.entries.filter((entry) => selected.has(entry.id)) : []),
    [group, selected],
  );
  const totalHours = chosenEntries.reduce((sum, entry) => sum + entry.hours, 0);
  const totalAmount = chosenEntries.reduce((sum, entry) => sum + entry.amount, 0);

  const changeMatter = (nextMatterId: string) => {
    setMatterId(nextMatterId);
    setSelected(new Set());
  };

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (!group) return;
    setSelected((current) =>
      current.size === group.entries.length ? new Set() : new Set(group.entries.map((entry) => entry.id)),
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (chosenEntries.length === 0) {
      setError("Select at least one time entry to invoice.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await apiRequest<{ id: string; number: string }>("/api/invoices", {
      body: {
        matterId,
        timeEntryIds: chosenEntries.map((entry) => entry.id),
        issueDate,
        dueDate: dueDate || null,
        notes: notes || null,
      },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/invoices/${result.data.id}`);
    router.refresh();
  };

  if (groups.length === 0) {
    return (
      <Callout tone="info" title="No unbilled time">
        Record billable time against a matter and it will appear here ready to invoice.
      </Callout>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error ? <Callout tone="danger">{error}</Callout> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Matter with unbilled time" htmlFor="invoice-matter" className="sm:col-span-2">
          <select
            id="invoice-matter"
            className="input"
            value={matterId}
            onChange={(event) => changeMatter(event.target.value)}
          >
            {groups.map((entry) => (
              <option key={entry.matterId} value={entry.matterId}>
                {entry.matterTitle} — {entry.clientName} ({formatMoney(entry.value)} unbilled)
              </option>
            ))}
          </select>
        </Field>
        <Field label="Invoice date" htmlFor="invoice-date">
          <input
            id="invoice-date"
            type="date"
            className="input"
            value={issueDate}
            onChange={(event) => setIssueDate(event.target.value)}
          />
        </Field>
        <Field label="Due date" htmlFor="invoice-due">
          <input
            id="invoice-due"
            type="date"
            className="input"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </Field>
        <Field label="Footer notes" htmlFor="invoice-notes" className="sm:col-span-2">
          <input
            id="invoice-notes"
            className="input"
            maxLength={2000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Payment due within 30 days. Make checks payable to the firm."
          />
        </Field>
      </div>

      {group ? (
        <div className="overflow-hidden rounded-lg border border-ink-200">
          <div className="flex items-center justify-between border-b border-ink-100 bg-ink-50 px-4 py-2.5">
            <label className="flex items-center gap-2 text-xs font-semibold text-ink-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-ink-300 accent-ink-900"
                checked={selected.size === group.entries.length && group.entries.length > 0}
                onChange={toggleAll}
              />
              Select all {group.entries.length} entries
            </label>
            <span className="text-xs text-ink-500">
              {totalHours.toFixed(2)} h · {formatMoney(totalAmount)}
            </span>
          </div>
          <ul className="max-h-[320px] divide-y divide-ink-100 overflow-y-auto">
            {group.entries.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 px-4 py-2.5">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-ink-300 accent-ink-900"
                  checked={selected.has(entry.id)}
                  onChange={() => toggle(entry.id)}
                  aria-label={`Bill ${entry.description}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-ink-800">{entry.description}</p>
                  <p className="text-[11px] text-ink-500">
                    {formatDate(entry.workDate)} · {entry.hours.toFixed(2)} h
                  </p>
                </div>
                <span className="text-xs font-medium text-ink-700">{formatMoney(entry.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={busy || chosenEntries.length === 0}>
          <Icon name="invoice" className="h-4 w-4" />
          {busy ? "Generating…" : `Generate invoice${chosenEntries.length ? ` · ${formatMoney(totalAmount)}` : ""}`}
        </button>
        <span className="text-[11px] text-ink-400">Selected entries are locked to the invoice once generated.</span>
      </div>
    </form>
  );
}

export function InvoiceStatusControl({ invoiceId, status }: { invoiceId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = async (nextStatus: string) => {
    setBusy(true);
    setError(null);
    const result = await apiRequest(`/api/invoices/${invoiceId}`, { method: "PATCH", body: { status: nextStatus } });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  return (
    <span className="inline-flex items-center gap-2">
      <select
        className="input w-auto py-1 text-xs"
        value={status}
        disabled={busy}
        onChange={(event) => change(event.target.value)}
        aria-label="Invoice status"
      >
        <option value="DRAFT">Draft</option>
        <option value="SENT">Sent</option>
        <option value="PAID">Paid</option>
      </select>
      {error ? <span className="text-[11px] text-red-600">{error}</span> : null}
    </span>
  );
}
