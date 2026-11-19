"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { Callout, Field } from "@/components/ui";
import { Icon } from "@/components/icons";
import { apiRequest } from "@/lib/client";
import { formatTime, todayISO } from "@/lib/dates";

type MatterOption = { id: string; title: string; clientName: string };

export type TimerState = {
  id: string;
  matterTitle: string;
  description: string;
  startedAt: string | null;
} | null;

export function TimerControls({ matters, active }: { matters: MatterOption[]; active: TimerState }) {
  const router = useRouter();
  const [matterId, setMatterId] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (active) {
    return (
      <div className="rounded-lg border border-brass-200 bg-brass-50 px-4 py-4">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brass-500 opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brass-600" />
          </span>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-brass-700">Timer running</p>
        </div>
        <p className="mt-2 text-sm font-medium text-ink-900">{active.matterTitle}</p>
        <p className="text-xs text-ink-600">
          {active.description} · started {formatTime(active.startedAt)}
        </p>
        <div className="mt-3">
          <ActionButton
            url={`/api/time/${active.id}/stop`}
            label="Stop timer and save"
            busyLabel="Saving…"
            icon="stop"
            className="btn btn-primary btn-sm"
          />
        </div>
      </div>
    );
  }

  const start = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await apiRequest("/api/time/start", { body: { matterId, description } });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDescription("");
    router.refresh();
  };

  if (matters.length === 0) {
    return <p className="text-xs text-ink-500">Open a matter before tracking time.</p>;
  }

  return (
    <form onSubmit={start} className="space-y-3">
      {error ? <Callout tone="danger">{error}</Callout> : null}
      <Field label="Matter" htmlFor="timer-matter">
        <select
          id="timer-matter"
          className="input"
          required
          value={matterId}
          onChange={(event) => setMatterId(event.target.value)}
        >
          <option value="">Select a matter…</option>
          {matters.map((matter) => (
            <option key={matter.id} value={matter.id}>
              {matter.title} — {matter.clientName}
            </option>
          ))}
        </select>
      </Field>
      <Field label="What are you working on?" htmlFor="timer-description">
        <input
          id="timer-description"
          className="input"
          maxLength={1000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Draft motion for summary judgment"
        />
      </Field>
      <button type="submit" className="btn btn-primary" disabled={busy || !matterId}>
        <Icon name="play" className="h-4 w-4" />
        {busy ? "Starting…" : "Start timer"}
      </button>
    </form>
  );
}

export function ManualTimeForm({
  matters,
  defaultRate,
}: {
  matters: MatterOption[];
  defaultRate: number;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    matterId: "",
    description: "",
    workDate: todayISO(),
    hours: "1.0",
    hourlyRate: defaultRate ? String(defaultRate) : "",
    billable: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const result = await apiRequest("/api/time", {
      body: {
        matterId: form.matterId,
        description: form.description,
        workDate: form.workDate,
        hours: Number(form.hours),
        hourlyRate: form.hourlyRate ? Number(form.hourlyRate) : undefined,
        billable: form.billable,
      },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(true);
    setForm((current) => ({ ...current, description: "", hours: "1.0" }));
    router.refresh();
  };

  if (matters.length === 0) {
    return <p className="text-xs text-ink-500">Open a matter before recording time.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {error ? <Callout tone="danger">{error}</Callout> : null}
      {saved ? <Callout tone="success">Time entry saved.</Callout> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Matter" htmlFor="manual-matter" className="sm:col-span-2">
          <select
            id="manual-matter"
            className="input"
            required
            value={form.matterId}
            onChange={(event) => setForm({ ...form, matterId: event.target.value })}
          >
            <option value="">Select a matter…</option>
            {matters.map((matter) => (
              <option key={matter.id} value={matter.id}>
                {matter.title} — {matter.clientName}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Description" htmlFor="manual-description" className="sm:col-span-2">
          <input
            id="manual-description"
            className="input"
            required
            maxLength={1000}
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            placeholder="Review discovery responses; confer with client"
          />
        </Field>

        <Field label="Date worked" htmlFor="manual-date">
          <input
            id="manual-date"
            type="date"
            className="input"
            required
            value={form.workDate}
            onChange={(event) => setForm({ ...form, workDate: event.target.value })}
          />
        </Field>

        <Field label="Hours" htmlFor="manual-hours" hint="Use tenths of an hour (1.5 = 1h 30m).">
          <input
            id="manual-hours"
            type="number"
            min={0.1}
            max={24}
            step={0.1}
            className="input"
            required
            value={form.hours}
            onChange={(event) => setForm({ ...form, hours: event.target.value })}
          />
        </Field>

        <Field label="Hourly rate" htmlFor="manual-rate" hint="Defaults to your profile rate.">
          <input
            id="manual-rate"
            type="number"
            min={0}
            max={5000}
            step={0.01}
            className="input"
            value={form.hourlyRate}
            onChange={(event) => setForm({ ...form, hourlyRate: event.target.value })}
            placeholder="300"
          />
        </Field>

        <label className="flex items-end gap-2 pb-2 text-sm text-ink-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-ink-300 accent-ink-900"
            checked={form.billable}
            onChange={(event) => setForm({ ...form, billable: event.target.checked })}
          />
          Billable
        </label>
      </div>

      <button type="submit" className="btn btn-secondary" disabled={busy || !form.matterId}>
        {busy ? "Saving…" : "Add time entry"}
      </button>
    </form>
  );
}
