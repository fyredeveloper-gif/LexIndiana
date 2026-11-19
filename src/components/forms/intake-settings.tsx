"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Callout, Field } from "@/components/ui";
import { Icon } from "@/components/icons";
import { apiRequest } from "@/lib/client";

export function IntakeSettingsPanel({
  enabled,
  token,
  headline,
  intro,
  total,
  newCount,
  reviewCount,
  appUrl,
}: {
  enabled: boolean;
  token: string | null;
  headline: string | null;
  intro: string | null;
  total: number;
  newCount: number;
  reviewCount: number;
  appUrl: string;
}) {
  const router = useRouter();
  const [origin, setOrigin] = useState(appUrl.replace(/\/+$/, ""));
  const [active, setActive] = useState(enabled);
  const [currentToken, setCurrentToken] = useState(token);
  const [headlineValue, setHeadlineValue] = useState(headline ?? "");
  const [introValue, setIntroValue] = useState(intro ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const link = currentToken ? `${origin}/request/${currentToken}` : null;

  const patch = async (body: Record<string, unknown>, key: string, success?: string) => {
    setBusy(key);
    setError(null);
    setSaved(null);
    const result = await apiRequest<{ enabled: boolean; token: string | null }>("/api/intake/settings", {
      method: "PATCH",
      body,
    });
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setActive(result.data.enabled);
    setCurrentToken(result.data.token);
    if (success) setSaved(success);
    router.refresh();
    return true;
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copy failed — select the link and copy it manually.");
    }
  };

  const rotate = async () => {
    if (!window.confirm("Rotate the intake link? The previous URL will stop working immediately.")) return;
    setBusy("rotate");
    setError(null);
    const result = await apiRequest<{ token: string }>("/api/intake/settings/rotate", { body: {} });
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCurrentToken(result.data.token);
    setActive(true);
    setSaved("A new intake link was generated. Update any place you shared the old one.");
    router.refresh();
  };

  return (
    <div className="space-y-5">
      {error ? <Callout tone="danger">{error}</Callout> : null}
      {saved ? <Callout tone="success">{saved}</Callout> : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-200 bg-ink-50/60 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className={
              active
                ? "badge bg-emerald-50 text-emerald-700"
                : "badge bg-ink-100 text-ink-600"
            }
          >
            {active ? "Link active" : "Link off"}
          </span>
          <span className="text-ink-500">
            {total} submission{total === 1 ? "" : "s"} · {newCount} new
            {reviewCount > 0 ? ` · ${reviewCount} need conflict review` : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/intake" className="btn btn-secondary btn-sm">
            Open intake inbox
          </Link>
          <button
            type="button"
            className={active ? "btn btn-danger btn-sm" : "btn btn-primary btn-sm"}
            onClick={() => patch({ enabled: !active }, "toggle", active ? "Public intake disabled." : "Public intake enabled.")}
            disabled={busy === "toggle"}
          >
            {busy === "toggle" ? "Saving…" : active ? "Disable" : "Enable public intake"}
          </button>
        </div>
      </div>

      {active && link ? (
        <div>
          <label className="label" htmlFor="intake-link">
            Public intake link
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input id="intake-link" readOnly value={link} className="input font-mono text-[12px]" onFocus={(event) => event.target.select()} />
            <div className="flex gap-2">
              <button type="button" onClick={copy} className="btn btn-secondary btn-sm whitespace-nowrap">
                <Icon name="shield" className="h-3.5 w-3.5" />
                {copied ? "Copied" : "Copy"}
              </button>
              <a href={link} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm whitespace-nowrap">
                <Icon name="arrowRight" className="h-3.5 w-3.5" />
                Preview
              </a>
              <button type="button" onClick={rotate} className="btn btn-secondary btn-sm whitespace-nowrap" disabled={busy === "rotate"}>
                {busy === "rotate" ? "Rotating…" : "Rotate"}
              </button>
            </div>
          </div>
          <p className="mt-1 text-[11px] text-ink-400">
            Anyone with this link can submit an intake request. It does not expose your matters, contacts, or files.
            Rotating immediately invalidates the old URL.
          </p>
        </div>
      ) : (
        <p className="text-xs leading-relaxed text-ink-500">
          {currentToken
            ? "The intake link is currently disabled. Enabling it reuses the existing URL unless you rotate it."
            : "Enable a private link to let prospective clients submit their details. A secret URL is generated for your workspace."}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Page headline" htmlFor="intake-headline" hint="Shown above the form.">
          <input
            id="intake-headline"
            className="input"
            maxLength={120}
            value={headlineValue}
            onChange={(event) => setHeadlineValue(event.target.value)}
            placeholder="Request a consultation"
          />
        </Field>
        <Field label="Introduction" htmlFor="intake-intro" hint="A sentence or two about your practice.">
          <input
            id="intake-intro"
            className="input"
            maxLength={600}
            value={introValue}
            onChange={(event) => setIntroValue(event.target.value)}
            placeholder="Tell us briefly about your situation…"
          />
        </Field>
      </div>

      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => patch({ headline: headlineValue || null, intro: introValue || null }, "copy", "Intake page copy saved.")}
        disabled={busy === "copy"}
      >
        {busy === "copy" ? "Saving…" : "Save page copy"}
      </button>
    </div>
  );
}
