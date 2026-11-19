import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { demoPassword, DEMO_EMAIL, desktopServerEnv } from "../desktop/runtime.mjs";
import { migrateEnvironment, seedDemoIfNeeded } from "../desktop/tasks.mjs";

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

async function waitFor(url, timeoutMs = 120_000) {
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

  server = spawn(process.execPath, [path.join(appDir, "desktop", "server.mjs")], {
    cwd: appDir,
    env: { ...process.env, ...env, LEX_APP_ROOT: appDir, LEX_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let serverLog = "";
  server.stdout?.on("data", (chunk) => {
    serverLog += chunk.toString();
  });
  server.stderr?.on("data", (chunk) => {
    serverLog += chunk.toString();
  });

  const ready = await waitFor(`http://127.0.0.1:${port}/login`);
  check("packaged Next server answers /login", ready, serverLog.slice(-800));

  const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: DEMO_EMAIL, password: demoPassword() }),
  });
  check("demo account can sign in on the packaged build", login.status === 200, `status ${login.status}`);

  const cookie = (login.headers.getSetCookie?.() ?? []).map((entry) => entry.split(";")[0]).join("; ");
  const tasks = await fetch(`http://127.0.0.1:${port}/tasks`, { headers: { cookie } });
  check("packaged app serves the tasks page", tasks.status === 200, `status ${tasks.status}`);
  check("tasks page shows seeded work", /deposition|discovery|inventory/i.test(await tasks.text()));

  const settings = await fetch(`http://127.0.0.1:${port}/settings/desktop`, { headers: { cookie } });
  check("packaged app serves the desktop settings page", settings.status === 200, `status ${settings.status}`);

  check(
    "packaged SQLite tuning ran",
    /\[db\] sqlite journal_mode=wal/.test(serverLog),
    serverLog.slice(-800),
  );
} catch (error) {
  failures += 1;
  console.error("FAIL  package smoke threw:", error instanceof Error ? error.message : error);
} finally {
  if (server?.pid) {
    if (process.platform === "win32") {
      spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } else {
      server.kill("SIGTERM");
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 800));
  try {
    rmSync(userDataDir, { recursive: true, force: true });
  } catch {
    // Windows can hold the SQLite file for a moment after taskkill; a leftover
    // temp directory must not fail an otherwise passing run.
  }
}

if (failures > 0) {
  console.error(`\n${failures} packaged-app check(s) failed.`);
  process.exit(1);
}
console.log("\nPackaged app checks passed.");
