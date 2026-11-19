/**
 * Starts a local PostgreSQL 18 instance for development using the embedded
 * binaries installed as a devDependency. Not for production use.
 *
 *   npm run db:local
 *
 * Credentials match .env.example: postgres/postgres on port 5432, database
 * `lex_indiana` (created automatically on first run).
 */
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const databaseDir = path.join(process.cwd(), ".pgdata");
const port = Number(process.env.EMBEDDED_PG_PORT ?? 5432);
const database = process.env.EMBEDDED_PG_DATABASE ?? "lex_indiana";

const pg = new EmbeddedPostgres({
  databaseDir,
  user: "postgres",
  password: "postgres",
  port,
  persistent: true,
});

async function main() {
  const fs = await import("node:fs");
  const initialised = fs.existsSync(path.join(databaseDir, "PG_VERSION"));
  if (!initialised) {
    console.log(`[db] initialising cluster at ${databaseDir}`);
    await pg.initialise();
  }
  await pg.start();
  console.log(`[db] postgres listening on 127.0.0.1:${port}`);

  try {
    await pg.createDatabase(database);
    console.log(`[db] created database ${database}`);
  } catch {
    console.log(`[db] database ${database} already exists`);
  }

  console.log(
    `[db] DATABASE_URL="postgresql://postgres:postgres@localhost:${port}/${database}?schema=public"`,
  );
  console.log("[db] press Ctrl+C to stop");

  const shutdown = async () => {
    console.log("\n[db] stopping");
    await pg.stop().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("[db] failed to start embedded postgres:", error);
  process.exit(1);
});
