import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { PrismaClient } from "@prisma/client";
import os from "node:os";
import path from "node:path";
import { backupDatabase, clearEnvironmentData } from "../desktop/backup.mjs";
import { readConfig } from "../desktop/config.mjs";
import { environmentPaths } from "../desktop/paths.mjs";
import { demoPassword, DEMO_EMAIL, desktopServerEnv } from "../desktop/runtime.mjs";
import { migrateEnvironment, seedDemoIfNeeded } from "../desktop/tasks.mjs";

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
/** @type {import("node:child_process").ChildProcess | null} */
let server = null;
let failures = 0;

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`PASS  ${label}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        probe.close();
        reject(new Error("Could not allocate a port."));
        return;
      }
      probe.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

async function waitFor(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return true;
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

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

  server = spawn(process.execPath, [path.join("desktop", "server.mjs")], {
    cwd: appRoot,
    env: { ...process.env, ...env, LEX_APP_ROOT: appRoot, LEX_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  server.stdout?.on("data", (chunk) => {
    serverLog += chunk.toString();
  });
  server.stderr?.on("data", (chunk) => {
    serverLog += chunk.toString();
  });

  const ready = await waitFor(`http://127.0.0.1:${port}/login`);
  check("embedded Next server answers /login", ready, serverLog.slice(-500));

  const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: DEMO_EMAIL, password: demoPassword() }),
  });
  check("demo account can sign in", login.status === 200, `status ${login.status}`);

  const cookie = (login.headers.getSetCookie?.() ?? []).map((entry) => entry.split(";")[0]).join("; ");
  const tasks = await fetch(`http://127.0.0.1:${port}/tasks`, { headers: { cookie } });
  const tasksHtml = await tasks.text();
  check("tasks page renders for the demo user", tasks.status === 200);
  check("tasks page shows seeded work", /deposition|discovery|inventory/i.test(tasksHtml));

  const calendar = await fetch(`http://127.0.0.1:${port}/calendar`, { headers: { cookie } });
  check("calendar page renders", calendar.status === 200);

  check(
    "server switches the demo database to WAL",
    /\[db\] sqlite journal_mode=wal/.test(serverLog),
    serverLog.slice(-500),
  );
  const probe = new PrismaClient({ datasources: { db: { url: `file:${paths.dbFile}` } } });
  try {
    const [journal] = await probe.$queryRawUnsafe("PRAGMA journal_mode");
    check("demo database file stays in WAL mode", String(journal?.journal_mode).toLowerCase() === "wal");
  } finally {
    await probe.$disconnect();
  }

  const desktopSettings = await fetch(`http://127.0.0.1:${port}/settings/desktop`, { headers: { cookie } });
  check("desktop settings page renders", desktopSettings.status === 200, `status ${desktopSettings.status}`);
  const desktopSettingsHtml = await desktopSettings.text();
  check("desktop settings page is the desktop panel route", /Desktop settings/i.test(desktopSettingsHtml));

  const liveEnv = desktopServerEnv({
    userDataDir,
    environment: "live",
    port,
    authSecret: config.authSecret,
  });
  await migrateEnvironment({ appRoot, userDataDir, environment: "live", baseEnv: liveEnv });
  const live = environmentPaths(userDataDir, "live");
  check("LIVE repository has its own database file", existsSync(live.dbFile));
  check("LIVE and DEMO files are different", live.dbFile !== paths.dbFile);
  check("demo data survived creating the live repository", existsSync(paths.dbFile));
} catch (error) {
  failures += 1;
  console.error("FAIL  smoke run threw:", error instanceof Error ? error.message : error);
} finally {
  if (server?.pid) {
    if (process.platform === "win32") {
      spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } else {
      server.kill("SIGTERM");
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 800));
  rmSync(userDataDir, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\n${failures} desktop smoke check(s) failed.`);
  process.exit(1);
}
console.log("\nDesktop smoke checks passed.");
