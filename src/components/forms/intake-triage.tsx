"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Callout, Field } from "@/components/ui";
import { apiRequest } from "@/lib/client";

export function IntakeTriage({
  submissionId,
  assignedToId,
  internalNote,
  members,
}: {
  submissionId: string;
  assignedToId: string | null;
  internalNote: string | null;
  members: Array<{ userId: string; name: string }>;
}) {
  const router = useRouter();
  const [assigned, setAssigned] = useState(assignedToId ?? "");
  const [note, setNote] = useState(internalNote ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const patch = async (key: string, body: Record<string, unknown>, message: string) => {
    setBusy(key);
    setError(null);
    setSaved(null);
    const result = await apiRequest(`/api/intake/${submissionId}`, { method: "PATCH", body });
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(message);
    router.refresh();
  };

  return (
    <div className="space-y-3">
      {error ? <Callout tone="danger">{error}</Callout> : null}
      {saved ? <Callout tone="success">{saved}</Callout> : null}
      <Field label="Assign to" htmlFor="intake-assignee" hint="Staff member responsible for this request.">
        <select
          id="intake-assignee"
          className="input"
          value={assigned}
          onChange={(event) => {
            const value = event.target.value;
            setAssigned(value);
            void patch("assign", { assignedToId: value || null }, value ? "Submission assigned." : "Assignment cleared.");
          }}
          disabled={busy === "assign"}
        >
          <option value="">Unassigned</option>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Internal note" htmlFor="intake-note" hint="Visible only to firm staff.">
        <textarea
          id="intake-note"
          className="input min-h-[80px]"
          maxLength={4000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Screening notes, callback time, or follow-up…"
        />
      </Field>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={busy === "note"}
        onClick={() => patch("note", { internalNote: note || null }, "Internal note saved.")}
      >
        {busy === "note" ? "Saving…" : "Save note"}
      </button>
    </div>
  );
}
