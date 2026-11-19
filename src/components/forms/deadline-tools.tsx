"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Callout, Field } from "@/components/ui";
import { Icon } from "@/components/icons";
import { apiRequest } from "@/lib/client";
import { formatDate, formatDateLong, relativeDueLabel, todayISO } from "@/lib/dates";
import { DEADLINE_PRESETS, SERVICE_METHODS, type DeadlineCalculation } from "@/lib/deadlines";
import { cn } from "@/lib/utils";

type MatterOption = { id: string; title: string; clientName: string };

const DEFAULT_TRIGGERS: Record<string, string> = {
  pleading_response: "Service of summons and complaint",
  motion_response: "Service of motion",
  motion_reply: "Service of the response",
  discovery_response: "Service of written discovery",
  jury_demand: "Service of the last pleading",
  motion_to_correct_error: "Entry of final judgment",
  notice_of_appeal: "Entry of final judgment",
  custom: "Triggering event",
};

export function DeadlineCalculator({
  matters,
  defaultMatterId,
}: {
  matters: MatterOption[];
  defaultMatterId?: string;
}) {
  const router = useRouter();
  const initial = DEADLINE_PRESETS[0];

  const [presetKey, setPresetKey] = useState(initial.key);
  const [title, setTitle] = useState(initial.label);
  const [days, setDays] = useState(initial.days);
  const [citation, setCitation] = useState(initial.citation);
  const [triggerEvent, setTriggerEvent] = useState(DEFAULT_TRIGGERS[initial.key]);
  const [triggerDate, setTriggerDate] = useState(todayISO());
  const [serviceMethod, setServiceMethod] = useState("E_SERVICE");
  const [matterId, setMatterId] = useState(defaultMatterId ?? "");
  const [notes, setNotes] = useState("");

  const [calculation, setCalculation] = useState<DeadlineCalculation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const chosenPreset = useMemo(() => DEADLINE_PRESETS.find((preset) => preset.key === presetKey), [presetKey]);

  useEffect(() => {
    if (!triggerDate || !Number.isFinite(days) || days < 1) {
      setCalculation(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await apiRequest<{ calculation: DeadlineCalculation }>("/api/deadlines/calculate", {
        body: { triggerDate, days, serviceMethod },
      });
      if (cancelled) return;
      if (result.ok) {
        setCalculation(result.data.calculation);
        setError(null);
      } else {
        setCalculation(null);
        setError(result.error);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [triggerDate, days, serviceMethod]);

  const choosePreset = (key: string) => {
    const preset = DEADLINE_PRESETS.find((entry) => entry.key === key);
    if (!preset) return;
    setPresetKey(key);
    setTitle(preset.label);
    setDays(preset.days);
    setCitation(preset.citation);
    setTriggerEvent(DEFAULT_TRIGGERS[key] ?? "Triggering event");
    setSaved(null);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!calculation) return;
    setSaving(true);
    setError(null);
    setSaved(null);

    const result = await apiRequest("/api/deadlines", {
      body: {
        matterId: matterId || null,
        title,
        ruleKey: presetKey,
        ruleCitation: citation || null,
        triggerEvent,
        triggerDate,
        serviceMethod,
        days,
        notes: notes || null,
      },
    });

    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(`Saved — due ${formatDateLong(calculation.dueDate)}.`);
    router.refresh();
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
      <form onSubmit={save} className="space-y-4">
        {error ? <Callout tone="danger">{error}</Callout> : null}
        {saved ? <Callout tone="success">{saved}</Callout> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Deadline type" htmlFor="preset" className="sm:col-span-2">
            <select id="preset" className="input" value={presetKey} onChange={(event) => choosePreset(event.target.value)}>
              {DEADLINE_PRESETS.map((preset) => (
                <option key={preset.key} value={preset.key}>
                  {preset.label}
                  {preset.citation ? ` — ${preset.citation}` : ""}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Matter" htmlFor="deadline-matter" hint="Optional — attach to a matter for tracking.">
            <select id="deadline-matter" className="input" value={matterId} onChange={(event) => setMatterId(event.target.value)}>
              <option value="">No matter (firm-wide)</option>
              {matters.map((matter) => (
                <option key={matter.id} value={matter.id}>
                  {matter.title} — {matter.clientName}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Deadline title" htmlFor="deadline-title">
            <input
              id="deadline-title"
              className="input"
              required
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>

          <Field label="Triggering event" htmlFor="trigger-event">
            <input
              id="trigger-event"
              className="input"
              required
              maxLength={200}
              value={triggerEvent}
              onChange={(event) => setTriggerEvent(event.target.value)}
            />
          </Field>

          <Field label="Trigger date" htmlFor="trigger-date">
            <input
              id="trigger-date"
              type="date"
              className="input"
              required
              value={triggerDate}
              onChange={(event) => setTriggerDate(event.target.value)}
            />
          </Field>

          <Field label="Service method" htmlFor="service-method">
            <select
              id="service-method"
              className="input"
              value={serviceMethod}
              onChange={(event) => setServiceMethod(event.target.value)}
            >
              {SERVICE_METHODS.map((method) => (
                <option key={method.key} value={method.key}>
                  {method.label}
                  {method.addedDays ? ` (+${method.addedDays} days)` : ""}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Prescribed period (days)" htmlFor="days">
            <input
              id="days"
              type="number"
              min={1}
              max={3650}
              className="input"
              required
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            />
          </Field>

          <Field label="Rule citation" htmlFor="citation" className="sm:col-span-2">
            <input
              id="citation"
              className="input"
              maxLength={200}
              value={citation}
              onChange={(event) => setCitation(event.target.value)}
              placeholder="Ind. R. Trial P. 6(D)(1)"
            />
          </Field>
        </div>

        <Field label="Notes" htmlFor="deadline-notes">
          <textarea
            id="deadline-notes"
            className="input min-h-[70px]"
            maxLength={4000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Service completed via the Indiana e-filing system; certificate of service filed."
          />
        </Field>

        {chosenPreset?.description ? (
          <p className="text-[11px] leading-relaxed text-ink-500">{chosenPreset.description}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="btn btn-primary" disabled={saving || !calculation}>
            <Icon name="calendar" className="h-4 w-4" />
            {saving ? "Saving…" : "Save deadline"}
          </button>
          <span className="text-[11px] text-ink-400">Preview updates as you change the trigger.</span>
        </div>
      </form>

      <div className="space-y-3">
        <div className="overflow-hidden rounded-xl border border-ink-800 bg-ink-950 p-5 text-white">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brass-300">Calculated deadline</p>
          {calculation ? (
            <>
              <p className="mt-2 font-serif text-[30px] font-semibold leading-none">
                {formatDate(calculation.dueDate)}
              </p>
              <p className="mt-2 text-xs text-ink-300">
                {relativeDueLabel(calculation.dueDate)} · {calculation.serviceLabel}
              </p>
              <div className="mt-4 space-y-1.5 border-t border-white/10 pt-3 text-[11px] text-ink-300">
                <div className="flex justify-between">
                  <span>Trigger date</span>
                  <span className="text-white">{formatDate(calculation.triggerDate)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Prescribed period</span>
                  <span className="text-white">{calculation.prescribedDays} days</span>
                </div>
                {calculation.mailDaysAdded > 0 ? (
                  <div className="flex justify-between text-brass-200">
                    <span>Mail service addition</span>
                    <span>+{calculation.mailDaysAdded} days</span>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <span>Unadjusted last day</span>
                  <span className="text-white">{formatDate(calculation.unadjustedDueDate)}</span>
                </div>
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-ink-300">Enter a trigger date and period to calculate.</p>
          )}
        </div>

        {calculation && calculation.adjustments.length > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">Rolled forward</p>
            <ul className="mt-1.5 space-y-1 text-xs text-amber-900">
              {calculation.adjustments.map((adjustment) => (
                <li key={adjustment.date} className="flex justify-between gap-2">
                  <span>{formatDate(adjustment.date)}</span>
                  <span className="font-medium">{adjustment.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {calculation ? (
          <div className={cn("rounded-lg border px-4 py-3 text-[11px] leading-relaxed", "border-ink-200 bg-white text-ink-600")}>
            <ul className="space-y-1">
              {calculation.notes.map((note) => (
                <li key={note} className="flex gap-1.5">
                  <span className="text-brass-500">•</span>
                  <span>{note}</span>
                </li>
              ))}
              <li className="flex gap-1.5">
                <span className="text-brass-500">•</span>
                <span>Day of the triggering event is excluded (T.R. 6(A)).</span>
              </li>
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
