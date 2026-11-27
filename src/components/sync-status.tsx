"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type SyncStatusPayload = {
  enabled: boolean;
  endpoint: string | null;
  deviceId: string;
  pending: number;
  conflicts: number;
  lastPulledAt: string | null;
  lastPushedAt: string | null;
  lastError: string | null;
};

function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/**
 * Polls the local sync status. Silent when the app is not configured for sync
 * beyond an "Offline" chip, so a browser deployment is unaffected.
 */
export function SyncStatus() {
  const [status, setStatus] = useState<SyncStatusPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/sync/status", { cache: "no-store" });
      if (!response.ok) return;
      setStatus((await response.json()) as SyncStatusPayload);
    } catch {
      // Offline or the server is restarting; keep the last known state.
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, [load]);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/sync/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Sync failed.");
      }
    } catch {
      setError("Sync failed.");
    }
    setBusy(false);
    await load();
  };

  if (!status) return null;

  const failing = Boolean(error || status.lastError);
  const label = busy
    ? "Syncing…"
    : !status.enabled
      ? "Offline"
      : failing
        ? "Sync error"
        : status.pending > 0
          ? `${status.pending} pending`
          : "Synced";

  const dot = busy
    ? "bg-sky-400 animate-pulse"
    : !status.enabled
      ? "bg-ink-500"
      : failing
        ? "bg-red-400"
        : status.pending > 0
          ? "bg-amber-400"
          : "bg-emerald-400";

  const detail = !status.enabled
    ? "Local only — no sync target"
    : status.lastPushedAt
      ? `Last sync ${timeLabel(status.lastPushedAt)}`
      : "Not synced yet";

  return (
    <div className="rounded-lg border border-white/10 px-2.5 py-2">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em]">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
        <span className="text-ink-300">{label}</span>
        {status.conflicts > 0 ? (
          <span className="ml-auto rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-medium normal-case tracking-normal text-amber-200">
            {status.conflicts} conflict{status.conflicts === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
      <p className="mt-1 truncate text-[10px] text-ink-500">{detail}</p>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <p className="truncate text-[9px] text-ink-600">{status.deviceId}</p>
        <button
          type="button"
          onClick={run}
          disabled={!status.enabled || busy}
          className="text-[10px] font-medium text-brass-300 transition hover:text-brass-200 disabled:opacity-40"
        >
          {busy ? "Syncing…" : "Sync now"}
        </button>
      </div>
      {failing ? (
        <p className="mt-1 line-clamp-2 text-[9px] leading-snug text-red-300">{error ?? status.lastError}</p>
      ) : null}
    </div>
  );
}
