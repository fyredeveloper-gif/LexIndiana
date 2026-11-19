import type { PrismaClient } from "@prisma/client";

/**
 * Concurrency settings for the single-file SQLite database.
 *
 * Prisma opens every pooled connection in the default rollback journal
 * (`journal_mode = delete`), so a writer blocks readers and a competing writer
 * fails with SQLITE_BUSY. The background sync worker writes while someone is
 * using the window, which is exactly that collision.
 *
 * WAL is a property of the database file, not of a connection, so applying it
 * once covers every connection and every other process that opens the file.
 *
 * `busy_timeout` is per connection, and Prisma has no connection option for it;
 * its SQLite connector already applies 5000 ms to each pooled connection. The
 * pragma below pins that value in one place instead of relying on the default.
 */
export const SQLITE_BUSY_TIMEOUT_MS = 5_000;

export type SqliteSettings = {
  journalMode: string;
  busyTimeoutMs: number;
};

/**
 * Applies the pragmas and reports what the connection ended up with, so startup
 * can log the effective settings instead of assuming they took.
 */
export async function configureSqlite(client: PrismaClient): Promise<SqliteSettings> {
  await client.$queryRawUnsafe(`PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);

  const journal = await client.$queryRawUnsafe<Array<{ journal_mode: string }>>(
    "PRAGMA journal_mode = WAL",
  );
  const timeout = await client.$queryRawUnsafe<Array<{ timeout: bigint | number }>>(
    "PRAGMA busy_timeout",
  );

  return {
    journalMode: String(journal[0]?.journal_mode ?? "").toLowerCase(),
    busyTimeoutMs: Number(timeout[0]?.timeout ?? 0),
  };
}
