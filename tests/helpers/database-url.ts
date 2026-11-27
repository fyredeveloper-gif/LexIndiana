import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Tests run against a throwaway SQLite database: no database server is needed,
 * and the developer's real desktop data files are never touched.
 *
 * The path is deterministic so the Vitest config, the global setup process, and
 * every worker agree on the same file. It is recreated by `prisma migrate
 * deploy` and emptied before each run.
 *
 * CI (or a developer) can override it with TEST_DATABASE_URL, for example
 * `TEST_DATABASE_URL=file:/tmp/lex-test.db`.
 */
const TEST_DIR = path.join(process.cwd(), ".tmp-test");
const TEST_FILE = path.join(TEST_DIR, "lex-indiana-test.db");

if (!process.env.TEST_DATABASE_URL) {
  mkdirSync(TEST_DIR, { recursive: true });
}

const configured = process.env.TEST_DATABASE_URL;

if (configured && !configured.startsWith("file:")) {
  throw new Error(
    "TEST_DATABASE_URL must be a SQLite file URL (for example file:/tmp/lex-test.db).",
  );
}

export const testDatabaseUrl = configured ?? `file:${TEST_FILE}`;
