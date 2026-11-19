import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { testDatabaseUrl } from "./helpers/database-url";

/**
 * Bring the isolated test schema up to date and clear any data left by a
 * previous run. `TRUNCATE ... CASCADE` is restricted to the dedicated schema.
 */
export default async function setup(): Promise<void> {
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: "pipe",
  });

  const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Firm", "User" RESTART IDENTITY CASCADE');
  await prisma.$disconnect();
}
