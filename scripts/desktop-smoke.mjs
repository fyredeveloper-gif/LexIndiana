import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import os from "node:os";
import path from "node:path";
import { backupDatabase, clearEnvironmentData } from "../desktop/backup.mjs";
import { readConfig } from "../desktop/config.mjs";
import { environmentPaths } from "../desktop/paths.mjs";
import { desktopServerEnv } from "../desktop/runtime.mjs";
import { migrateEnvironment, seedDemoIfNeeded } from "../desktop/tasks.mjs";
import {
  createChecker,
  freePort,
  signIn,
  signInAsDemo,
  startDesktopServer,
  waitFor,
} from "./desktop-smoke-utils.mjs";

/**
 * Verifies everything the Electron shell does except opening a window:
 *   1. per-install config + auth secret
 *   2. SQLite migration of the DEMO repository
 *   3. first-launch demo seed
 *   4. embedded production server + real login
 *   5. LIVE repository created separately, demo data untouched
 *
 * Usage: npm run desktop:smoke
 */
const appRoot = process.cwd();
const userDataDir = mkdtempSync(path.join(os.tmpdir(), "lex-desktop-smoke-"));
/** @type {ReturnType<typeof startDesktopServer> | null} */
let server = null;
/** @type {ReturnType<typeof startDesktopServer> | null} */
let liveServer = null;
const checker = createChecker();
const { check } = checker;

try {
  const config = readConfig(userDataDir);
  check("config created with a per-install auth secret", config.authSecret.length >= 32);
  check("default environment is demo", config.environment === "demo");

  const port = await freePort();
  const env = desktopServerEnv({
    userDataDir,
    environment: "demo",
    port,
    authSecret: config.authSecret,
  });
  // databaseUrl is normalised to forward slashes for Prisma on Windows too, so
  // this must not be built from path.sep.
  check("demo database URL points into the demo repository", env.DATABASE_URL.includes("/demo/"));

  const paths = await migrateEnvironment({
    appRoot,
    userDataDir,
    environment: "demo",
    baseEnv: env,
  });
  check("demo SQLite file created", existsSync(paths.dbFile), paths.dbFile);

  const seed = await seedDemoIfNeeded({ appRoot, paths, baseEnv: env });
  check("demo repository seeded on first launch", seed.seeded);

  const second = await seedDemoIfNeeded({ appRoot, paths: { ...paths, fresh: false }, baseEnv: env });
  check("seed is skipped on later launches", second.seeded === false);

  // Demo reset primitives: back up, clear, keep the backup.
  const scratchDir = mkdtempSync(path.join(os.tmpdir(), "lex-desktop-reset-"));
  try {
    const scratchPaths = environmentPaths(scratchDir, "demo");
    mkdirSync(path.dirname(scratchPaths.dbFile), { recursive: true });
    writeFileSync(scratchPaths.dbFile, "demo-database");
    const backup = backupDatabase(scratchPaths);
    check(
      "reset backs up the demo database first",
      Boolean(backup && existsSync(backup) && backup.startsWith(scratchPaths.backupDir)),
    );
    clearEnvironmentData(scratchPaths);
    check("reset removes the old demo database", !existsSync(scratchPaths.dbFile));
    check("reset keeps the backup after clearing", Boolean(backup && existsSync(backup)));
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }

  server = startDesktopServer({ appDir: appRoot, env, port });

  const ready = await waitFor(`http://127.0.0.1:${port}/login`);
  check("embedded Next server answers /login", ready, server.log().slice(-500));

  const login = await signInAsDemo(`http://127.0.0.1:${port}`);
  check("demo account can sign in", login.status === 200, `status ${login.status}`);

  const tasks = await fetch(`http://127.0.0.1:${port}/tasks`, { headers: { cookie: login.cookie } });
  const tasksHtml = await tasks.text();
  check("tasks page renders for the demo user", tasks.status === 200);
  check("tasks page shows seeded work", /deposition|discovery|inventory/i.test(tasksHtml));

  const calendar = await fetch(`http://127.0.0.1:${port}/calendar`, { headers: { cookie: login.cookie } });
  check("calendar page renders", calendar.status === 200);

  check(
    "server switches the demo database to WAL",
    /\[db\] sqlite journal_mode=wal/.test(server.log()),
    server.log().slice(-500),
  );
  const probe = new PrismaClient({ datasources: { db: { url: `file:${paths.dbFile}` } } });
  try {
    const [journal] = await probe.$queryRawUnsafe("PRAGMA journal_mode");
    check("demo database file stays in WAL mode", String(journal?.journal_mode).toLowerCase() === "wal");
  } finally {
    await probe.$disconnect();
  }

  const desktopSettings = await fetch(`http://127.0.0.1:${port}/settings/desktop`, {
    headers: { cookie: login.cookie },
  });
  check("desktop settings page renders", desktopSettings.status === 200, `status ${desktopSettings.status}`);
  const desktopSettingsHtml = await desktopSettings.text();
  check("desktop settings page is the desktop panel route", /Desktop settings/i.test(desktopSettingsHtml));

  // LIVE is the repository a real install uses, so boot it and go through the
  // first-owner bootstrap rather than only checking the file appeared.
  const livePort = await freePort();
  const liveEnv = desktopServerEnv({
    userDataDir,
    environment: "live",
    port: livePort,
    authSecret: config.authSecret,
  });
  await migrateEnvironment({ appRoot, userDataDir, environment: "live", baseEnv: liveEnv });
  const live = environmentPaths(userDataDir, "live");
  check("LIVE repository has its own database file", existsSync(live.dbFile));
  check("LIVE and DEMO files are different", live.dbFile !== paths.dbFile);

  liveServer = startDesktopServer({ appDir: appRoot, env: liveEnv, port: livePort });
  const liveReady = await waitFor(`http://127.0.0.1:${livePort}/login`, 120_000);
  check("LIVE server answers on its own port", liveReady, liveServer.log().slice(-500));

  const registerPage = await fetch(`http://127.0.0.1:${livePort}/register`, { redirect: "manual" });
  const registerHtml = await registerPage.text();
  check(
    "LIVE opens the first-workspace registration page",
    registerPage.status === 200 && /Create the first workspace/i.test(registerHtml),
    `status ${registerPage.status}`,
  );

  const ownerEmail = "pike@erickson.test";
  const ownerPassword = "EricksonPike2026!";
  const register = await fetch(`http://127.0.0.1:${livePort}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Marta Pike",
      firmName: "Erickson & Pike LLP",
      email: ownerEmail,
      password: ownerPassword,
    }),
  });
  check("LIVE bootstraps the first firm and owner", register.status === 201, `status ${register.status}`);

  const secondRegister = await fetch(`http://127.0.0.1:${livePort}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Second Owner",
      firmName: "Another Firm LLP",
      email: "second@erickson.test",
      password: ownerPassword,
    }),
  });
  check("LIVE closes bootstrap after the first firm", secondRegister.status === 403, `status ${secondRegister.status}`);

  const closedRegisterPage = await fetch(`http://127.0.0.1:${livePort}/register`, { redirect: "manual" });
  check(
    "LIVE register page is gone once bootstrap closes",
    closedRegisterPage.status === 404,
    `status ${closedRegisterPage.status}`,
  );

  const liveSession = await signIn(`http://127.0.0.1:${livePort}`, ownerEmail, ownerPassword);
  check("bootstrap owner can sign in to LIVE", liveSession.status === 200, `status ${liveSession.status}`);

  const liveTasks = await fetch(`http://127.0.0.1:${livePort}/tasks`, {
    headers: { cookie: liveSession.cookie },
  });
  check("LIVE workspace renders for the new owner", liveTasks.status === 200, `status ${liveTasks.status}`);

  const liveProbe = new PrismaClient({ datasources: { db: { url: live.databaseUrl } } });
  try {
    const [firms] = await liveProbe.$queryRawUnsafe('select count(*) as count from "Firm"');
    const [liveTaskCount] = await liveProbe.$queryRawUnsafe('select count(*) as count from "Task"');
    check("LIVE holds exactly the bootstrapped firm", Number(firms?.count) === 1);
    check("LIVE received none of the demo seed", Number(liveTaskCount?.count) === 0);
  } finally {
    await liveProbe.$disconnect();
  }

  // Stronger than checking the demo file still exists: the demo server keeps
  // answering with the demo session after LIVE was bootstrapped.
  const demoStillServing = await fetch(`http://127.0.0.1:${port}/tasks`, { headers: { cookie: login.cookie } });
  check(
    "demo repository still serves after the LIVE bootstrap",
    demoStillServing.status === 200,
    `status ${demoStillServing.status}`,
  );
} catch (error) {
  check(`smoke run threw: ${error instanceof Error ? error.message : error}`, false);
} finally {
  liveServer?.stop();
  server?.stop();
  await new Promise((resolve) => setTimeout(resolve, 800));
  rmSync(userDataDir, { recursive: true, force: true });
}

if (checker.failures > 0) {
  console.error(`\n${checker.failures} desktop smoke check(s) failed.`);
  process.exit(1);
}
console.log("\nDesktop smoke checks passed.");
