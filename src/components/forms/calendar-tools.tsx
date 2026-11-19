"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Callout, Field } from "@/components/ui";
import { Icon } from "@/components/icons";
import { apiRequest } from "@/lib/client";
import { todayISO, toIndianaDateTimeLocal } from "@/lib/dates";
import { CALENDAR_EVENT_TYPE_LABELS } from "@/lib/utils";

type MatterOption = { id: string; title: string; clientName: string };

export function CalendarEventForm({
  matters,
  defaultMatterId,
  defaultDate,
}: {
  matters: MatterOption[];
  defaultMatterId?: string;
  defaultDate?: string;
}) {
  const router = useRouter();
  const defaultStart = `${defaultDate ?? todayISO()}T09:00`;
  const [form, setForm] = useState({
    title: "",
    type: "MEETING",
    matterId: defaultMatterId ?? "",
    startsAt: defaultStart,
    endsAt: "",
    location: "",
    description: "",
    allDay: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);

    const result = await apiRequest("/api/calendar", {
      body: {
        title: form.title,
        type: form.type,
        matterId: form.matterId || null,
        startsAt: form.startsAt,
        endsAt: form.endsAt || null,
        location: form.location || null,
        description: form.description || null,
        allDay: form.allDay,
      },
    });

    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(true);
    setForm((current) => ({
      ...current,
      title: "",
      endsAt: "",
      location: "",
      description: "",
    }));
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {error ? <Callout tone="danger">{error}</Callout> : null}
      {saved ? <Callout tone="success">Event added to the calendar.</Callout> : null}

      <Field label="Event" htmlFor="event-title">
        <input
          id="event-title"
          className="input"
          required
          maxLength={200}
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
          placeholder="Status conference with Judge Patel"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type" htmlFor="event-type">
          <select
            id="event-type"
            className="input"
            value={form.type}
            onChange={(event) => setForm({ ...form, type: event.target.value })}
          >
            {Object.entries(CALENDAR_EVENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Matter" htmlFor="event-matter">
          <select
            id="event-matter"
            className="input"
            value={form.matterId}
            onChange={(event) => setForm({ ...form, matterId: event.target.value })}
          >
            <option value="">No matter</option>
            {matters.map((matter) => (
              <option key={matter.id} value={matter.id}>
                {matter.title} — {matter.clientName}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Starts" htmlFor="event-start">
          <input
            id="event-start"
            type="datetime-local"
            className="input"
            required
            value={form.startsAt}
            onChange={(event) => setForm({ ...form, startsAt: event.target.value })}
          />
        </Field>

        <Field label="Ends" htmlFor="event-end" hint="Optional.">
          <input
            id="event-end"
            type="datetime-local"
            className="input"
            value={form.endsAt}
            onChange={(event) => setForm({ ...form, endsAt: event.target.value })}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-xs text-ink-600">
        <input
          type="checkbox"
          checked={form.allDay}
          onChange={(event) => setForm({ ...form, allDay: event.target.checked })}
        />
        All-day event
      </label>

      <Field label="Location" htmlFor="event-location">
        <input
          id="event-location"
          className="input"
          maxLength={200}
          value={form.location}
          onChange={(event) => setForm({ ...form, location: event.target.value })}
          placeholder="Marion Superior Court, Courtroom 6"
        />
      </Field>

      <Field label="Notes" htmlFor="event-description">
        <textarea
          id="event-description"
          className="input min-h-[70px]"
          maxLength={4000}
          value={form.description}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
          placeholder="Bring the exhibit binder and the proposed scheduling order."
        />
      </Field>

      <button type="submit" className="btn btn-primary" disabled={busy || !form.title.trim()}>
        <Icon name="calendar" className="h-4 w-4" />
        {busy ? "Saving…" : "Add event"}
      </button>
    </form>
  );
}

type EditableEvent = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  location: string | null;
  matterId: string | null;
  matterTitle: string | null;
};

/** Inline editor used from the event lists; deletion stays a separate action. */
export function CalendarEventEditForm({
  event,
  matters,
}: {
  event: EditableEvent;
  matters: MatterOption[];
}) {
  const router = useRouter();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [form, setForm] = useState({
    title: event.title,
    type: event.type,
    matterId: event.matterId ?? "",
    startsAt: toIndianaDateTimeLocal(event.startsAt),
    endsAt: event.endsAt ? toIndianaDateTimeLocal(event.endsAt) : "",
    location: event.location ?? "",
    description: event.description ?? "",
    allDay: event.allDay,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The picker only lists open matters; keep the event's own matter selectable
  // so editing an older event never silently detaches it from a closed matter.
  const matterOptions =
    event.matterId && !matters.some((matter) => matter.id === event.matterId)
      ? [{ id: event.matterId, title: event.matterTitle ?? "Current matter", clientName: "" }, ...matters]
      : matters;

  const close = () => {
    if (detailsRef.current) detailsRef.current.open = false;
  };

  const submit = async (formEvent: FormEvent) => {
    formEvent.preventDefault();
    setBusy(true);
    setError(null);

    const result = await apiRequest(`/api/calendar/${event.id}`, {
      method: "PATCH",
      body: {
        title: form.title,
        type: form.type,
        matterId: form.matterId || null,
        startsAt: form.startsAt,
        endsAt: form.endsAt || null,
        location: form.location || null,
        description: form.description || null,
        allDay: form.allDay,
      },
    });

    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    close();
    router.refresh();
  };

  return (
    <details ref={detailsRef} className="mt-2">
      <summary className="inline cursor-pointer list-none text-[11px] font-medium text-ink-400 hover:text-ink-900">
        Edit details
      </summary>
      <form onSubmit={submit} className="mt-2 space-y-3 rounded-lg border border-ink-200 bg-white p-3">
        {error ? <Callout tone="danger">{error}</Callout> : null}

        <Field label="Event" htmlFor={`event-edit-title-${event.id}`}>
          <input
            id={`event-edit-title-${event.id}`}
            className="input"
            required
            maxLength={200}
            value={form.title}
            onChange={(inputEvent) => setForm({ ...form, title: inputEvent.target.value })}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type" htmlFor={`event-edit-type-${event.id}`}>
            <select
              id={`event-edit-type-${event.id}`}
              className="input"
              value={form.type}
              onChange={(inputEvent) => setForm({ ...form, type: inputEvent.target.value })}
            >
              {Object.entries(CALENDAR_EVENT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Matter" htmlFor={`event-edit-matter-${event.id}`}>
            <select
              id={`event-edit-matter-${event.id}`}
              className="input"
              value={form.matterId}
              onChange={(inputEvent) => setForm({ ...form, matterId: inputEvent.target.value })}
            >
              <option value="">No matter</option>
              {matterOptions.map((matter) => (
                <option key={matter.id} value={matter.id}>
                  {matter.clientName ? `${matter.title} — ${matter.clientName}` : matter.title}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Starts" htmlFor={`event-edit-start-${event.id}`}>
            <input
              id={`event-edit-start-${event.id}`}
              type="datetime-local"
              className="input"
              required
              value={form.startsAt}
              onChange={(inputEvent) => setForm({ ...form, startsAt: inputEvent.target.value })}
            />
          </Field>

          <Field label="Ends" htmlFor={`event-edit-end-${event.id}`} hint="Optional.">
            <input
              id={`event-edit-end-${event.id}`}
              type="datetime-local"
              className="input"
              value={form.endsAt}
              onChange={(inputEvent) => setForm({ ...form, endsAt: inputEvent.target.value })}
            />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-xs text-ink-600">
          <input
            type="checkbox"
            checked={form.allDay}
            onChange={(inputEvent) => setForm({ ...form, allDay: inputEvent.target.checked })}
          />
          All-day event
        </label>

        <Field label="Location" htmlFor={`event-edit-location-${event.id}`}>
          <input
            id={`event-edit-location-${event.id}`}
            className="input"
            maxLength={200}
            value={form.location}
            onChange={(inputEvent) => setForm({ ...form, location: inputEvent.target.value })}
          />
        </Field>

        <Field label="Notes" htmlFor={`event-edit-description-${event.id}`}>
          <textarea
            id={`event-edit-description-${event.id}`}
            className="input min-h-[70px]"
            maxLength={4000}
            value={form.description}
            onChange={(inputEvent) => setForm({ ...form, description: inputEvent.target.value })}
          />
        </Field>

        <div className="flex items-center gap-2">
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !form.title.trim()}>
            <Icon name="calendar" className="h-3.5 w-3.5" />
            {busy ? "Saving…" : "Save changes"}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={close} disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
    </details>
  );
}
