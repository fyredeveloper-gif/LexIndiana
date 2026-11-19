import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { desktopServerEnv } from "../desktop/runtime.mjs";
import { migrateEnvironment, seedDemoIfNeeded } from "../desktop/tasks.mjs";
import {
  createChecker,
  freePort,
  signInAsDemo,
  startDesktopServer,
  waitFor,
} from "./desktop-smoke-utils.mjs";

/**
 * Runs the packaged app the way desktop/main.mjs starts it, minus the window:
 * migrate the DEMO repository with the packaged Prisma CLI, run the packaged
 * seed bundle, boot the embedded server from the packaged Next build and sign
 * in. A layout check cannot prove the platform-specific query engine loads or
 * that Windows paths survive migration, so this does it for real.
 *
 * Usage: node scripts/desktop-package-smoke.mjs <unpacked>/resources/app
 */
const appDir = process.argv[2] ? path.resolve(process.argv[2]) : "";
if (!appDir || !existsSync(path.join(appDir, "package.json"))) {
  console.error("usage: node scripts/desktop-package-smoke.mjs <unpacked>/resources/app");
  process.exit(2);
}

const userDataDir = mkdtempSync(path.join(os.tmpdir(), "lex-package-smoke-"));
/** @type {ReturnType<typeof startDesktopServer> | null} */
let server = null;
const checker = createChecker();
const { check } = checker;

try {
  console.log(`[package-smoke] app tree ${appDir}`);

  const port = await freePort();
  const env = desktopServerEnv({
    userDataDir,
    environment: "demo",
    port,
    authSecret: "package-smoke-secret-at-least-32-characters",
  });

  const paths = await migrateEnvironment({ appRoot: appDir, userDataDir, environment: "demo", baseEnv: env });
  check("packaged Prisma CLI migrated the demo repository", existsSync(paths.dbFile), paths.dbFile);

  const seed = await seedDemoIfNeeded({ appRoot: appDir, paths, baseEnv: env });
  check("packaged seed bundle populated the demo repository", seed.seeded);

  // Load Prisma's client from the packaged tree, not this repo's node_modules,
  // so the shipped query engine binary is the one under test.
  const require = createRequire(path.join(appDir, "package.json"));
  const { PrismaClient } = require("@prisma/client");
  const probe = new PrismaClient({ datasources: { db: { url: paths.databaseUrl } } });
  try {
    // Any answer proves the shipped engine binary loads; the WAL switch happens
    // later, when the server starts.
    const [row] = await probe.$queryRawUnsafe("select 1 as ok");
    check("packaged query engine answers a query", Number(row?.ok) === 1);
  } catch (error) {
    check("packaged query engine answers a query", false, error instanceof Error ? error.message : String(error));
  } finally {
    await probe.$disconnect();
  }

  server = startDesktopServer({ appDir, env, port });

  const ready = await waitFor(`http://127.0.0.1:${port}/login`, 120_000);
  check("packaged Next server answers /login", ready, server.log().slice(-800));

  const login = await signInAsDemo(`http://127.0.0.1:${port}`);
  check("demo account can sign in on the packaged build", login.status === 200, `status ${login.status}`);

  const tasks = await fetch(`http://127.0.0.1:${port}/tasks`, { headers: { cookie: login.cookie } });
  check("packaged app serves the tasks page", tasks.status === 200, `status ${tasks.status}`);
  check("tasks page shows seeded work", /deposition|discovery|inventory/i.test(await tasks.text()));

  const settings = await fetch(`http://127.0.0.1:${port}/settings/desktop`, { headers: { cookie: login.cookie } });
  check("packaged app serves the desktop settings page", settings.status === 200, `status ${settings.status}`);

  check(
    "packaged SQLite tuning ran",
    /\[db\] sqlite journal_mode=wal/.test(server.log()),
    server.log().slice(-800),
  );
} catch (error) {
  check(`package smoke threw: ${error instanceof Error ? error.message : error}`, false);
} finally {
  server?.stop();
  await new Promise((resolve) => setTimeout(resolve, 800));
  try {
    rmSync(userDataDir, { recursive: true, force: true });
  } catch {
    // Windows can hold the SQLite file for a moment after taskkill; a leftover
    // temp directory must not fail an otherwise passing run.
  }
}

if (checker.failures > 0) {
  console.error(`\n${checker.failures} packaged-app check(s) failed.`);
  process.exit(1);
}
console.log("\nPackaged app checks passed.");
