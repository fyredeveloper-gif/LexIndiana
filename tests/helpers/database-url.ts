import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Tests never run against the development schema. They use a dedicated
 * PostgreSQL schema (default `lex_indiana_test`) created by `prisma migrate
 * deploy` in global setup.
 */
function loadDotEnv(): void {
  try {
    for (const line of readFileSync(path.join(process.cwd(), ".env"), "utf8").split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // CI can supply DATABASE_URL directly.
  }
}

loadDotEnv();

const baseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!baseUrl) {
  throw new Error(
    "Tests need DATABASE_URL (or TEST_DATABASE_URL) pointing at a PostgreSQL database.",
  );
}

const url = new URL(baseUrl);
if (!process.env.TEST_DATABASE_URL) {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (!localHosts.has(url.hostname)) {
    throw new Error(
      "Refusing to create a test schema on a non-local database. Set TEST_DATABASE_URL explicitly for a dedicated test server.",
    );
  }
}
const schema = process.env.TEST_DATABASE_SCHEMA ?? "lex_indiana_test";
if (schema === "public") {
  throw new Error("TEST_DATABASE_SCHEMA must not be public; tests truncate their schema.");
}
url.searchParams.set("schema", schema);

export const testDatabaseUrl = url.toString();
export const testDatabaseSchema = schema;
