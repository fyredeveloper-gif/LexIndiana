/**
 * Next.js instrumentation hook. Runs once per server process, before requests.
 * Database tuning and sync only apply to the Node runtime (never to Edge or
 * during a build).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  try {
    const [{ rawPrisma }, { configureSqlite }] = await Promise.all([
      import("@/lib/prisma"),
      import("@/lib/sqlite"),
    ]);
    const sqlite = await configureSqlite(rawPrisma);
    console.log(
      `[db] sqlite journal_mode=${sqlite.journalMode} busy_timeout=${sqlite.busyTimeoutMs}ms`,
    );
  } catch (error) {
    // Tuning must not stop the server from serving; the warning is enough to
    // spot a database file that cannot switch journal mode.
    console.warn("[db] could not apply SQLite pragmas", error);
  }

  const { startSyncWorker } = await import("@/lib/sync/worker");
  startSyncWorker();
}
