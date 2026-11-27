import os from "node:os";
import path from "node:path";

/**
 * Each environment gets its own repository folder, so switching between LIVE
 * and DEMO never mixes or wipes data:
 *
 *   <userData>/data/demo/lex-indiana.db
 *   <userData>/data/live/lex-indiana.db
 *
 * Files are written with forward slashes in the Prisma URL so Windows paths
 * work too (Prisma expects file:C:/Users/... , not file:C:\Users\...).
 */
export const ENVIRONMENTS = /** @type {const} */ (["demo", "live"]);
export const DEFAULT_ENVIRONMENT = "demo";

/** @param {unknown} value */
export function isEnvironment(value) {
  return value === "demo" || value === "live";
}

/**
 * @param {string} userDataDir
 * @param {"demo" | "live"} environment
 */
export function environmentPaths(userDataDir, environment) {
  const root = path.join(userDataDir, "data", environment);
  const dbFile = path.join(root, "lex-indiana.db");
  return {
    environment,
    root,
    dbFile,
    databaseUrl: `file:${dbFile.split(path.sep).join("/")}`,
    storageRoot: path.join(root, "storage"),
    backupDir: path.join(root, "backups"),
    seedMarker: path.join(root, ".seeded"),
  };
}

/** @param {string} userDataDir */
export function configFile(userDataDir) {
  return path.join(userDataDir, "desktop.config.json");
}

/**
 * Mirrors Electron's app.getPath("userData") so the dev launcher prepares the
 * same folders the Electron main process will use.
 * @param {string} appName
 */
export function devUserDataDir(appName) {
  const home = os.homedir();
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), appName);
  }
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", appName);
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), appName);
}
