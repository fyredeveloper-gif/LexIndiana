"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { Callout } from "@/components/ui";
import { apiRequest } from "@/lib/client";

export function MatterAccessPanel({
  matterId,
  consultants,
  granted,
}: {
  matterId: string;
  consultants: Array<{ userId: string; name: string; email: string }>;
  granted: Array<{ userId: string; name: string; email: string }>;
}) {
  const router = useRouter();
  const grantedIds = new Set(granted.map((entry) => entry.userId));
  const available = consultants.filter((consultant) => !grantedIds.has(consultant.userId));
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grant = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    const result = await apiRequest(`/api/matters/${matterId}/access`, {
      method: "POST",
      body: { userId: selected },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSelected("");
    router.refresh();
  };

  return (
    <div className="space-y-3">
      {error ? <Callout tone="danger">{error}</Callout> : null}
      {granted.length === 0 ? (
        <p className="text-xs text-ink-500">No consultants have access to this matter.</p>
      ) : (
        <ul className="space-y-1.5">
          {granted.map((entry) => (
            <li
              key={entry.userId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-100 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-ink-800">{entry.name}</p>
                <p className="text-[11px] text-ink-500">{entry.email}</p>
              </div>
              <ActionButton
                url={`/api/matters/${matterId}/access?userId=${entry.userId}`}
                method="DELETE"
                label="Revoke"
                busyLabel="…"
                confirmText={`Revoke ${entry.name}'s access to this matter?`}
                className="text-[11px] font-medium text-ink-400 hover:text-red-600"
              />
            </li>
          ))}
        </ul>
      )}

      {available.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input w-[220px] text-xs"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            aria-label="Share with consultant"
          >
            <option value="">Select a consultant…</option>
            {available.map((consultant) => (
              <option key={consultant.userId} value={consultant.userId}>
                {consultant.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-secondary btn-sm" onClick={grant} disabled={!selected || busy}>
            {busy ? "Sharing…" : "Share matter"}
          </button>
        </div>
      ) : consultants.length === 0 ? (
        <p className="text-[11px] text-ink-400">
          Invite a consultant under Firm to share individual matters with them.
        </p>
      ) : null}
    </div>
  );
}
