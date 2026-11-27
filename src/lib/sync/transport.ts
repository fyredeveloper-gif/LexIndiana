/**
 * Sync configuration is environment-driven so the same build can run as a
 * desktop peer, a hosted peer, or with sync disabled. The endpoint never
 * contains credentials; the shared secret travels in a header.
 */
export type SyncConfig = {
  enabled: boolean;
  endpoint: string;
  secret: string;
  deviceId: string;
  intervalMs: number;
};

export function syncConfigFromEnv(): SyncConfig {
  const endpoint = (process.env.LEX_SYNC_ENDPOINT || "").trim().replace(/\/+$/, "");
  const enabledEnv = (process.env.LEX_SYNC_ENABLED || "").toLowerCase();
  const enabled = enabledEnv === "1" || enabledEnv === "true";
  const interval = Number(process.env.LEX_SYNC_INTERVAL_MS ?? 30_000);
  return {
    enabled: enabled && Boolean(endpoint),
    endpoint,
    secret: process.env.LEX_SYNC_SECRET || "",
    deviceId: (process.env.LEX_DEVICE_ID || "web").trim() || "web",
    intervalMs: Number.isFinite(interval) && interval >= 5_000 ? interval : 30_000,
  };
}

export type PushResponse = {
  ok: boolean;
  applied: number;
  skipped: number;
  conflicts: Array<{ entity: string; entityId: string; remotePayload: string | null }>;
};

export type PullResponse = {
  ok: boolean;
  ops: Array<{
    id: string;
    firmId: string;
    deviceId: string;
    entity: string;
    entityId: string;
    operation: string;
    payload: string | null;
    createdAt: string;
  }>;
  cursor: string | null;
};

async function requestJson<T>(url: string, init: RequestInit, secret: string): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret) headers["x-sync-secret"] = secret;

  const response = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(30_000) });
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(body?.error ?? `Sync request failed (${response.status}).`);
  }
  return body as T;
}

export function pushToPeer(
  config: SyncConfig,
  payload: { firmId: string; deviceId: string; ops: unknown[] },
): Promise<PushResponse> {
  return requestJson<PushResponse>(
    `${config.endpoint}/api/sync/push`,
    { method: "POST", body: JSON.stringify(payload) },
    config.secret,
  );
}

export function pullFromPeer(
  config: SyncConfig,
  params: { firmId: string; deviceId: string; since: string | null; limit?: number },
): Promise<PullResponse> {
  const query = new URLSearchParams({
    firmId: params.firmId,
    deviceId: params.deviceId,
    limit: String(params.limit ?? 200),
  });
  if (params.since) query.set("since", params.since);
  return requestJson<PullResponse>(
    `${config.endpoint}/api/sync/pull?${query.toString()}`,
    { method: "GET" },
    config.secret,
  );
}
