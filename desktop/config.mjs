import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { configFile, DEFAULT_ENVIRONMENT, isEnvironment } from "./paths.mjs";

/**
 * Desktop settings live in userData/desktop.config.json.
 *
 * `authSecret` is generated once per installation and is required by the Next
 * server for session cookies. It never leaves the machine.
 *
 * `environment` selects which repository (demo or live) the app opens. Changing
 * it is never destructive: both databases stay on disk.
 */
function defaults() {
  return {
    version: 1,
    environment: DEFAULT_ENVIRONMENT,
    authSecret: randomBytes(32).toString("base64url"),
    // Stable per-install device identity; the sync feed excludes own changes.
    deviceId: `desktop-${randomBytes(6).toString("hex")}`,
    sync: {
      enabled: false,
      // Peer base URL, e.g. http://127.0.0.1:3100. Empty = local-only.
      endpoint: "",
      // Shared peer secret (SYNC_SECRET on the peer). Never sent to the browser.
      secret: "",
    },
  };
}

/** @param {unknown} raw */
function normalize(raw) {
  const base = defaults();
  if (!raw || typeof raw !== "object") return base;
  const value = /** @type {Record<string, any>} */ (raw);
  return {
    version: 1,
    environment: isEnvironment(value.environment) ? value.environment : base.environment,
    authSecret:
      typeof value.authSecret === "string" && value.authSecret.length >= 32
        ? value.authSecret
        : base.authSecret,
    deviceId:
      typeof value.deviceId === "string" && value.deviceId.length >= 4
        ? value.deviceId
        : base.deviceId,
    sync: {
      enabled: value.sync?.enabled === true,
      endpoint: typeof value.sync?.endpoint === "string" ? value.sync.endpoint : "",
      secret: typeof value.sync?.secret === "string" ? value.sync.secret : "",
    },
  };
}

/** @param {string} userDataDir */
export function readConfig(userDataDir) {
  const file = configFile(userDataDir);
  if (!existsSync(file)) {
    const fresh = defaults();
    writeConfig(userDataDir, fresh);
    return fresh;
  }
  try {
    return normalize(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    // A corrupt settings file must not brick the app; defaults recreate it.
    const fresh = defaults();
    writeConfig(userDataDir, fresh);
    return fresh;
  }
}

/**
 * @param {string} userDataDir
 * @param {ReturnType<typeof defaults>} config
 */
export function writeConfig(userDataDir, config) {
  const file = configFile(userDataDir);
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, file);
  try {
    chmodSync(file, 0o600);
  } catch {
    // Windows does not implement POSIX modes; the folder is already per-user.
  }
}

/**
 * @param {string} userDataDir
 * @param {Partial<{ environment: "demo" | "live"; sync: Partial<{ enabled: boolean; endpoint: string; secret: string }> }>} patch
 */
export function updateConfig(userDataDir, patch) {
  const current = readConfig(userDataDir);
  const next = normalize({
    ...current,
    ...patch,
    sync: { ...current.sync, ...(patch.sync ?? {}) },
  });
  writeConfig(userDataDir, next);
  return next;
}
