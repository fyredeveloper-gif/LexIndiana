"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { apiRequest } from "@/lib/client";

export type ActiveTimer = {
  id: string;
  matterId: string;
  matterTitle: string;
  description: string;
  startedAt: string | null;
};

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => value.toString().padStart(2, "0")).join(":");
}

export function TimerWidget({ active }: { active: ActiveTimer | null }) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active?.startedAt) {
      setElapsed(0);
      return;
    }
    const started = new Date(active.startedAt).getTime();
    setElapsed(Date.now() - started);
    const interval = setInterval(() => setElapsed(Date.now() - started), 1000);
    return () => clearInterval(interval);
  }, [active?.startedAt]);

  if (!active) {
    return (
      <Link
        href="/time"
        className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2.5 text-xs text-ink-300 transition hover:border-white/20 hover:text-white"
      >
        <span className="flex items-center gap-2">
          <Icon name="clock" className="h-4 w-4" />
          No timer running
        </span>
        <Icon name="play" className="h-3.5 w-3.5" />
      </Link>
    );
  }

  const stop = async () => {
    setBusy(true);
    setError(null);
    const result = await apiRequest(`/api/time/${active.id}/stop`, { method: "POST", body: {} });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  return (
    <div className="rounded-lg border border-brass-500/40 bg-brass-500/10 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-brass-200">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brass-400 opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brass-300" />
          </span>
          Timer running
        </span>
        <span className="font-mono text-sm font-semibold tabular-nums text-white">{formatElapsed(elapsed)}</span>
      </div>
      <p className="mt-1.5 truncate text-[11px] text-ink-200">{active.matterTitle}</p>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={stop}
          disabled={busy}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-white/90 px-2 py-1 text-[11px] font-semibold text-ink-900 transition hover:bg-white disabled:opacity-60"
        >
          <Icon name="stop" className="h-3 w-3" />
          {busy ? "Stopping…" : "Stop & save"}
        </button>
        <Link href="/time" className="rounded-md px-2 py-1 text-[11px] font-medium text-ink-200 hover:text-white">
          Details
        </Link>
      </div>
      {error ? <p className="mt-1.5 text-[11px] text-red-300">{error}</p> : null}
    </div>
  );
}
