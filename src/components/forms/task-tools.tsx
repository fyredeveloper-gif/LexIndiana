"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Callout, Field } from "@/components/ui";
import { Icon } from "@/components/icons";
import { apiRequest } from "@/lib/client";
import { TASK_PRIORITY_LABELS } from "@/lib/utils";

type MatterOption = { id: string; title: string; clientName: string };
type MemberOption = { userId: string; name: string; role: string };

export function TaskForm({
  matters,
  members = [],
  defaultMatterId,
}: {
  matters: MatterOption[];
  members?: MemberOption[];
  defaultMatterId?: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    title: "",
    description: "",
    matterId: defaultMatterId ?? "",
    assigneeId: "",
    dueDate: "",
    priority: "MEDIUM",
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);

    const result = await apiRequest("/api/tasks", {
      body: {
        title: form.title,
        description: form.description || null,
        matterId: form.matterId || null,
        assigneeId: form.assigneeId || null,
        dueDate: form.dueDate || null,
        priority: form.priority,
      },
    });

    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(true);
    setForm((current) => ({ ...current, title: "", description: "", dueDate: "" }));
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {error ? <Callout tone="danger">{error}</Callout> : null}
      {saved ? <Callout tone="success">Task added.</Callout> : null}

      <Field label="Task" htmlFor="task-title">
        <input
          id="task-title"
          className="input"
          required
          maxLength={200}
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
          placeholder="Prepare witness outline for deposition"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Matter" htmlFor="task-matter">
          <select
            id="task-matter"
            className="input"
            value={form.matterId}
            onChange={(event) => setForm({ ...form, matterId: event.target.value })}
          >
            <option value="">No matter (firm-wide)</option>
            {matters.map((matter) => (
              <option key={matter.id} value={matter.id}>
                {matter.title} — {matter.clientName}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Due date" htmlFor="task-due">
          <input
            id="task-due"
            type="date"
            className="input"
            value={form.dueDate}
            onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
          />
        </Field>

        <Field label="Priority" htmlFor="task-priority">
          <select
            id="task-priority"
            className="input"
            value={form.priority}
            onChange={(event) => setForm({ ...form, priority: event.target.value })}
          >
            {Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        {members.length > 0 ? (
          <Field label="Assign to" htmlFor="task-assignee">
            <select
              id="task-assignee"
              className="input"
              value={form.assigneeId}
              onChange={(event) => setForm({ ...form, assigneeId: event.target.value })}
            >
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </div>

      <Field label="Notes" htmlFor="task-description" hint="Optional context for whoever picks this up.">
        <textarea
          id="task-description"
          className="input min-h-[70px]"
          maxLength={4000}
          value={form.description}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
          placeholder="Confirm the court reporter and send the notice to counsel."
        />
      </Field>

      <button type="submit" className="btn btn-primary" disabled={busy || !form.title.trim()}>
        <Icon name="check" className="h-4 w-4" />
        {busy ? "Saving…" : "Add task"}
      </button>
    </form>
  );
}

type EditableTask = {
  id: string;
  title: string;
  description: string | null;
  matterId: string | null;
  matterTitle: string | null;
  assigneeId: string | null;
  dueDate: string | null;
  priority: string;
};

/** Inline editor used from the task lists; leaves completion and delete alone. */
export function TaskEditForm({
  task,
  matters,
  members = [],
}: {
  task: EditableTask;
  matters: MatterOption[];
  members?: MemberOption[];
}) {
  const router = useRouter();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [form, setForm] = useState({
    title: task.title,
    description: task.description ?? "",
    matterId: task.matterId ?? "",
    assigneeId: task.assigneeId ?? "",
    dueDate: task.dueDate ?? "",
    priority: task.priority,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The picker only lists open matters; keep a task's own matter selectable so
  // editing an older task never silently detaches it from a closed matter.
  const matterOptions =
    task.matterId && !matters.some((matter) => matter.id === task.matterId)
      ? [{ id: task.matterId, title: task.matterTitle ?? "Current matter", clientName: "" }, ...matters]
      : matters;

  const close = () => {
    if (detailsRef.current) detailsRef.current.open = false;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const result = await apiRequest(`/api/tasks/${task.id}`, {
      method: "PATCH",
      body: {
        title: form.title,
        description: form.description || null,
        matterId: form.matterId || null,
        assigneeId: form.assigneeId || null,
        dueDate: form.dueDate || null,
        priority: form.priority,
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

        <Field label="Task" htmlFor={`task-edit-title-${task.id}`}>
          <input
            id={`task-edit-title-${task.id}`}
            className="input"
            required
            maxLength={200}
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Matter" htmlFor={`task-edit-matter-${task.id}`}>
            <select
              id={`task-edit-matter-${task.id}`}
              className="input"
              value={form.matterId}
              onChange={(event) => setForm({ ...form, matterId: event.target.value })}
            >
              <option value="">No matter (firm-wide)</option>
              {matterOptions.map((matter) => (
                <option key={matter.id} value={matter.id}>
                  {matter.clientName ? `${matter.title} — ${matter.clientName}` : matter.title}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Due date" htmlFor={`task-edit-due-${task.id}`}>
            <input
              id={`task-edit-due-${task.id}`}
              type="date"
              className="input"
              value={form.dueDate}
              onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
            />
          </Field>

          <Field label="Priority" htmlFor={`task-edit-priority-${task.id}`}>
            <select
              id={`task-edit-priority-${task.id}`}
              className="input"
              value={form.priority}
              onChange={(event) => setForm({ ...form, priority: event.target.value })}
            >
              {Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          {members.length > 0 ? (
            <Field label="Assign to" htmlFor={`task-edit-assignee-${task.id}`}>
              <select
                id={`task-edit-assignee-${task.id}`}
                className="input"
                value={form.assigneeId}
                onChange={(event) => setForm({ ...form, assigneeId: event.target.value })}
              >
                <option value="">Unassigned</option>
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </div>

        <Field label="Notes" htmlFor={`task-edit-description-${task.id}`}>
          <textarea
            id={`task-edit-description-${task.id}`}
            className="input min-h-[70px]"
            maxLength={4000}
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </Field>

        <div className="flex items-center gap-2">
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !form.title.trim()}>
            <Icon name="check" className="h-3.5 w-3.5" />
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
