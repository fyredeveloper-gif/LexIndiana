import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { testDatabaseUrl } from "./helpers/database-url";

/**
 * Bring the isolated SQLite test database up to date and clear any data left
 * by a previous run. Only the dedicated test file is ever touched.
 */
export default async function setup(): Promise<void> {
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: "pipe",
  });

  const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  // SQLite has no TRUNCATE; deleting the tenants cascades to every child row.
  await prisma.$executeRawUnsafe('DELETE FROM "Firm"');
  await prisma.$executeRawUnsafe('DELETE FROM "User"');
  await prisma.$disconnect();
}
