"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { Callout, Card, CardHeader, Field } from "@/components/ui";
import { cn } from "@/lib/utils";

type Environment = "demo" | "live";

type DesktopSyncState = {
  enabled: boolean;
  endpoint: string;
  hasSecret: boolean;
};

type DesktopState = {
  environment: Environment;
  environments: Environment[];
  sync: DesktopSyncState;
  deviceId: string;
  backupFolder: string;
  databasePath: string;
  dataFolder: string;
  version: string;
  dev: boolean;
  url: string;
  error: string | null;
};

type DesktopResult = {
  ok: boolean;
  error?: string;
  restartRequired?: boolean;
  state?: DesktopState;
  backupPath?: string | null;
};

type DesktopBridge = {
  getState: () => Promise<DesktopState>;
  setEnvironment: (environment: Environment) => Promise<DesktopResult>;
  setSync: (settings: {
    enabled: boolean;
    endpoint: string;
    secret?: string;
    clearSecret?: boolean;
  }) => Promise<DesktopResult>;
  resetDemo: () => Promise<DesktopResult>;
  openDataFolder: () => Promise<{ ok: boolean }>;
  onState: (callback: (state: DesktopState) => void) => () => void;
};

declare global {
  interface Window {
    lexDesktop?: DesktopBridge;
  }
}

const ENVIRONMENT_COPY: Record<Environment, { name: string; description: string }> = {
  demo: {
    name: "Demo",
    description: "The synthetic Haynes firm. Safe to experiment with, and can be reset from the seed.",
  },
  live: {
    name: "Live",
    description: "Real practice data. Starts empty and is never reset from this page.",
  },
};

/**
 * Desktop-only controls. Everything here goes through the preload bridge; the
 * same page renders a plain explanation in a browser deployment, where the
 * narrow IPC surface does not exist.
 */
export function DesktopSettings() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [state, setState] = useState<DesktopState | null>(null);
  const [mode, setMode] = useState<"offline" | "online">("offline");
  const [endpoint, setEndpoint] = useState("");
  const [secret, setSecret] = useState("");
  const [clearSecret, setClearSecret] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [backupPath, setBackupPath] = useState<string | null>(null);

  const apply = useCallback((next: DesktopState) => {
    setState(next);
    setMode(next.sync.enabled ? "online" : "offline");
    setEndpoint(next.sync.endpoint);
    setClearSecret(false);
  }, []);

  useEffect(() => {
    const bridge = window.lexDesktop;
    setSupported(Boolean(bridge));
    if (!bridge) return;

    let active = true;
    const load = (next: DesktopState) => {
      if (active) apply(next);
    };
    void bridge
      .getState()
      .then(load)
      .catch(() => setNotice({ tone: "danger", text: "Could not read this installation's settings." }));
    const unsubscribe = bridge.onState(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [apply]);

  const saveSync = async () => {
    const bridge = window.lexDesktop;
    if (!bridge) return;
    const trimmed = endpoint.trim();
    if (mode === "online" && !/^https?:\/\//i.test(trimmed)) {
      setNotice({ tone: "danger", text: "Enter a sync endpoint starting with http:// or https://." });
      return;
    }

    setBusy("sync");
    setNotice(null);
    try {
      const result = await bridge.setSync({
        enabled: mode === "online",
        endpoint: trimmed,
        secret: secret.trim() || undefined,
        clearSecret,
      });
      if (!result.ok) {
        setNotice({ tone: "danger", text: result.error ?? "Could not save sync settings." });
      } else {
        setSecret("");
        setNotice({
          tone: "success",
          text: result.restartRequired
            ? "Saved. Restart the desktop app (and dev server) to apply the new sync state."
            : mode === "online"
              ? "Sync enabled. The app is restarting to connect."
              : "Sync disabled. The app is restarting in offline mode.",
        });
        if (result.state) apply(result.state);
      }
    } catch {
      setNotice({ tone: "danger", text: "Could not save sync settings." });
    }
    setBusy(null);
  };

  const switchEnvironment = async (environment: Environment) => {
    const bridge = window.lexDesktop;
    if (!bridge || busy) return;
    setBusy(environment);
    setNotice(null);
    try {
      const result = await bridge.setEnvironment(environment);
      if (!result.ok) {
        setNotice({ tone: "danger", text: result.error ?? "Could not switch repositories." });
      } else if (result.restartRequired) {
        setNotice({
          tone: "success",
          text: `Saved for ${ENVIRONMENT_COPY[environment].name}. Restart the desktop app to open that repository.`,
        });
      }
      if (result.state) apply(result.state);
    } catch {
      setNotice({ tone: "danger", text: "Could not switch repositories." });
    }
    setBusy(null);
  };

  const resetDemo = async () => {
    const bridge = window.lexDesktop;
    if (!bridge || !confirmReset || busy) return;
    setBusy("reset");
    setNotice(null);
    setBackupPath(null);
    try {
      const result = await bridge.resetDemo();
      if (!result.ok) {
        setNotice({ tone: "danger", text: result.error ?? "Could not reset the demo repository." });
      } else {
        setConfirmReset(false);
        setBackupPath(result.backupPath ?? null);
        setNotice({ tone: "success", text: "Demo repository reset from the seed. A backup was saved first." });
        if (result.state) apply(result.state);
      }
    } catch {
      setNotice({ tone: "danger", text: "Could not reset the demo repository." });
    }
    setBusy(null);
  };

  if (supported === null) {
    return (
      <Card>
        <div className="px-5 py-8 text-sm text-ink-500">Reading this installation&apos;s settings…</div>
      </Card>
    );
  }

  if (!supported) {
    return (
      <Card>
        <CardHeader title="Desktop app only" icon="briefcase" />
        <div className="space-y-3 px-5 py-5 text-sm text-ink-600">
          <p>
            Repository switching, local sync settings and demo reset belong to the Electron app that runs the
            local server. This browser session does not have access to them.
          </p>
          <p className="text-xs text-ink-500">
            In a deployment, sync is configured with <code className="font-mono">LEX_SYNC_*</code> environment
            variables and the demo seed never runs.
          </p>
          <Link href="/settings" className="btn btn-secondary">
            Back to settings
          </Link>
        </div>
      </Card>
    );
  }

  if (!state) {
    return (
      <Card>
        <div className="px-5 py-8 text-sm text-ink-500">Reading this installation&apos;s settings…</div>
      </Card>
    );
  }

  const active = state.environment;

  return (
    <div className="space-y-6">
      {notice ? <Callout tone={notice.tone}>{notice.text}</Callout> : null}
      {state.error ? <Callout tone="danger">{state.error}</Callout> : null}

      <Card>
        <CardHeader
          title="Repository"
          description="Each environment keeps its own SQLite database. Switching never deletes records."
          icon="scale"
        />
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
          {(state.environments.length > 0 ? state.environments : (["demo", "live"] as Environment[])).map(
            (environment) => {
              const copy = ENVIRONMENT_COPY[environment];
              const isActive = active === environment;
              return (
                <div
                  key={environment}
                  className={cn(
                    "rounded-lg border px-4 py-4",
                    isActive ? "border-brass-300 bg-brass-50/40" : "border-ink-100 bg-white",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink-900">{copy.name}</p>
                    {isActive ? (
                      <span className="rounded-full bg-brass-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brass-700">
                        Active
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-ink-600">{copy.description}</p>
                  {isActive ? (
                    <code className="mt-3 block truncate font-mono text-[10px] text-ink-500" title={state.databasePath}>
                      {state.databasePath}
                    </code>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void switchEnvironment(environment)}
                      disabled={busy !== null}
                      className="btn btn-secondary mt-3"
                    >
                      {busy === environment ? "Switching…" : `Switch to ${copy.name}`}
                    </button>
                  )}
                </div>
              );
            },
          )}
        </div>
        <p className="border-t border-ink-100 px-5 py-3 text-xs text-ink-500">
          The app restarts its local server when you switch, so the other repository opens at the sign-in screen.
        </p>
      </Card>

      <Card>
        <CardHeader
          title="Sync"
          description="Offline keeps everything on this computer. Online pushes changes to a sync peer."
          icon="shield"
        />
        <div className="space-y-4 px-5 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                value: "offline" as const,
                title: "Offline",
                copy: "No network calls. Changes stay in the local outbox until you go online.",
              },
              {
                value: "online" as const,
                title: "Online / synced",
                copy: "Push local changes and pull peer changes in the background.",
              },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setMode(option.value)}
                aria-pressed={mode === option.value}
                className={cn(
                  "rounded-lg border px-4 py-3 text-left transition",
                  mode === option.value
                    ? "border-brass-300 bg-brass-50/40"
                    : "border-ink-100 bg-white hover:border-ink-200",
                )}
              >
                <p className="text-sm font-semibold text-ink-900">{option.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-600">{option.copy}</p>
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Sync endpoint"
              htmlFor="desktop-sync-endpoint"
              hint="Base URL of the demo sync server, e.g. http://127.0.0.1:3100."
            >
              <input
                id="desktop-sync-endpoint"
                className="input font-mono text-[13px]"
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
                placeholder="http://127.0.0.1:3100"
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
            <Field
              label="Peer secret"
              htmlFor="desktop-sync-secret"
              hint={
                state.sync.hasSecret
                  ? "A secret is saved. Leave blank to keep it."
                  : "Must match SYNC_SECRET on the sync peer."
              }
            >
              <input
                id="desktop-sync-secret"
                type="password"
                className="input font-mono text-[13px]"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                placeholder={state.sync.hasSecret ? "•••••••• (saved)" : "Shared peer secret"}
                autoComplete="off"
              />
            </Field>
          </div>

          {state.sync.hasSecret ? (
            <label className="flex items-center gap-2 text-xs text-ink-600">
              <input
                type="checkbox"
                checked={clearSecret}
                onChange={(event) => setClearSecret(event.target.checked)}
              />
              Forget the saved peer secret
            </label>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-ink-500">
              Device <code className="font-mono">{state.deviceId}</code>. Live sync activity is shown in the
              sidebar chip.
            </p>
            <button type="button" onClick={() => void saveSync()} disabled={busy !== null} className="btn btn-primary">
              {busy === "sync" ? "Saving…" : "Save sync settings"}
            </button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="This installation" description="Where the local data lives" icon="briefcase" />
        <div className="space-y-3 px-5 py-5 text-sm text-ink-600">
          <dl className="grid gap-2 sm:grid-cols-[160px_1fr]">
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">Version</dt>
            <dd>{state.version}</dd>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">Database</dt>
            <dd className="truncate font-mono text-[11px]" title={state.databasePath}>
              {state.databasePath}
            </dd>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">Backups</dt>
            <dd className="truncate font-mono text-[11px]" title={state.backupFolder}>
              {state.backupFolder}
            </dd>
          </dl>
          <button
            type="button"
            onClick={() => void window.lexDesktop?.openDataFolder()}
            className="btn btn-secondary"
          >
            <Icon name="template" className="h-4 w-4" />
            Open data folder
          </button>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Reset demo data"
          description="Only the demo repository can be reset. The live repository is never touched."
          icon="shield"
        />
        <div className="space-y-4 px-5 py-5">
          {active !== "demo" ? (
            <p className="text-sm text-ink-600">
              You are currently in the <strong>Live</strong> repository. Switch to Demo to reset its seed data.
            </p>
          ) : (
            <>
              <p className="text-sm text-ink-600">
                This replaces every demo record with the original Haynes seed. Before anything is deleted, the
                current database is copied to{" "}
                <code className="font-mono text-[11px]">{state.backupFolder}</code>.
              </p>
              <label className="flex items-start gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={confirmReset}
                  onChange={(event) => setConfirmReset(event.target.checked)}
                />
                <span>I understand the demo records will be replaced and a backup will be kept.</span>
              </label>
              {backupPath ? (
                <p className="text-xs text-ink-500">
                  Backup: <code className="font-mono">{backupPath}</code>
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => void resetDemo()}
                disabled={!confirmReset || busy !== null}
                className="btn btn-secondary disabled:opacity-50"
              >
                {busy === "reset" ? "Backing up and resetting…" : "Back up and reset demo data"}
              </button>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
