"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { apiRequest } from "@/lib/client";

export function ActionButton({
  url,
  method = "POST",
  body,
  label,
  busyLabel = "Working…",
  confirmText,
  className = "btn btn-secondary btn-sm",
  icon,
  doneLabel,
}: {
  url: string;
  method?: "POST" | "PATCH" | "DELETE";
  body?: unknown;
  label: string;
  busyLabel?: string;
  confirmText?: string;
  className?: string;
  icon?: string;
  doneLabel?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    const result = await apiRequest(url, {
      method,
      body: body === undefined && method !== "DELETE" ? {} : body,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDone(true);
    router.refresh();
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" onClick={run} disabled={busy} className={className}>
        {icon ? <Icon name={icon} className="h-3.5 w-3.5" /> : null}
        {busy ? busyLabel : done && doneLabel ? doneLabel : label}
      </button>
      {error ? <span className="max-w-[220px] text-[11px] leading-snug text-red-600">{error}</span> : null}
    </span>
  );
}
