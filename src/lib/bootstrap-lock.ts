/**
 * Serializes first-owner registration attempts inside this process.
 *
 * The previous implementation used a PostgreSQL advisory lock. The app now runs
 * on SQLite (desktop first, single-instance hosted demo), where an in-process
 * mutex gives the same guarantee without raw SQL: two concurrent bootstrap
 * requests cannot both observe an empty database. Multi-instance deployments
 * would need a database-backed lock instead; the rate limiter already requires
 * a single instance.
 */
let tail: Promise<unknown> = Promise.resolve();

export function withBootstrapLock<T>(operation: () => Promise<T>): Promise<T> {
  const run = tail.then(operation, operation);
  tail = run.catch(() => undefined);
  return run;
}
