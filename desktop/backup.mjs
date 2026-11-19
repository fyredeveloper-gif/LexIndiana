import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

/**
 * Copies the environment's SQLite file into its `backups/` folder before a
 * destructive action. Returns the backup path, or null when there is nothing
 * to back up yet.
 *
 * Called only while the local server is stopped. The database runs in WAL mode,
 * so commits that were not checkpointed still live in the `-wal` file; it is
 * copied alongside the backup so a restore cannot lose the newest writes.
 *
 * @param {ReturnType<typeof import("./paths.mjs").environmentPaths>} paths
 * @param {{ now?: Date }} [options]
 */
export function backupDatabase(paths, { now = new Date() } = {}) {
  if (!existsSync(paths.dbFile)) return null;

  mkdirSync(paths.backupDir, { recursive: true });
  const stamp = now.toISOString().replace(/[:.]/g, "-").replace("T", "-").slice(0, 19);
  let target = path.join(paths.backupDir, `lex-indiana-${stamp}.db`);
  let suffix = 1;
  while (existsSync(target)) {
    target = path.join(paths.backupDir, `lex-indiana-${stamp}-${suffix}.db`);
    suffix += 1;
  }

  copyFileSync(paths.dbFile, target);
  const wal = `${paths.dbFile}-wal`;
  if (existsSync(wal)) copyFileSync(wal, `${target}-wal`);
  return target;
}

/**
 * Removes one environment's database, journal files, uploaded storage and seed
 * marker. `backups/` is deliberately untouched.
 *
 * @param {ReturnType<typeof import("./paths.mjs").environmentPaths>} paths
 */
export function clearEnvironmentData(paths) {
  for (const file of [
    paths.dbFile,
    `${paths.dbFile}-journal`,
    `${paths.dbFile}-wal`,
    `${paths.dbFile}-shm`,
  ]) {
    rmSync(file, { force: true });
  }
  rmSync(paths.storageRoot, { recursive: true, force: true });
  rmSync(paths.seedMarker, { force: true });
}
