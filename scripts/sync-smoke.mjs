import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { readConfig } from "../desktop/config.mjs";
import { desktopServerEnv } from "../desktop/runtime.mjs";
import { migrateEnvironment, seedDemoIfNeeded } from "../desktop/tasks.mjs";

/**
 * Phase 2 sync smoke test against a real second instance:
 *   1. bootstrap a seeded demo desktop into an empty demo sync server
 *   2. apply an edit made on the server (as another device) on the client
 *   3. resolve a conflicting edit with server-wins + a recorded conflict
 *   4. surface an offline sync error while the app keeps working
 *
 * Usage: npm run desktop:seed:bundle && npm run sync:smoke
 */
const appRoot = process.cwd();
const serverDir = mkdtempSync(path.join(os.tmpdir(), "lex-sync-server-"));
const clientDir = mkdtempSync(path.join(os.tmpdir(), "lex-sync-client-"));
const secret = randomBytes(24).toString("base64url");
const children = [];
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

function startApp(name, userDataDir, port, env) {
  const child = spawn(process.execPath, [path.join("desktop", "server.mjs")], {
    cwd: appRoot,
    env: { ...process.env, ...env, LEX_APP_ROOT: appRoot, LEX_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.log = "";
  child.stdout?.on("data", (chunk) => {
    child.log += chunk.toString();
  });
  child.stderr?.on("data", (chunk) => {
    child.log += chunk.toString();
  });
  children.push(child);
  return child;
}

async function json(url, init = {}) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);
  return { response, body };
}

function authed(cookie, extra = {}) {
  return { cookie, "content-type": "application/json", ...extra };
}

try {
  if (!existsSync(path.join(appRoot, "desktop", "build", "seed-haynes.mjs"))) {
    throw new Error("Demo seed bundle missing. Run `npm run desktop:seed:bundle` first.");
  }

  const serverPort = await freePort();
  const clientPort = await freePort();
  const serverConfig = readConfig(serverDir);
  const clientConfig = readConfig(clientDir);

  const serverEnv = desktopServerEnv({
    userDataDir: serverDir,
    environment: "demo",
    port: serverPort,
    authSecret: serverConfig.authSecret,
    sync: { enabled: false, endpoint: "", secret: "" },
    deviceId: "demo-sync-server",
  });
  const clientEnv = desktopServerEnv({
    userDataDir: clientDir,
    environment: "demo",
    port: clientPort,
    authSecret: clientConfig.authSecret,
    sync: {
      enabled: true,
      endpoint: `http://127.0.0.1:${serverPort}`,
      secret,
    },
    deviceId: "desktop-client-a",
  });

  // Server: schema only, no demo data, secret-protected sync endpoints.
  await migrateEnvironment({ appRoot, userDataDir: serverDir, environment: "demo", baseEnv: serverEnv });

  // Client: schema + the normal first-launch demo seed.
  const clientPaths = await migrateEnvironment({
    appRoot,
    userDataDir: clientDir,
    environment: "demo",
    baseEnv: clientEnv,
  });
  const seed = await seedDemoIfNeeded({ appRoot, paths: clientPaths, baseEnv: clientEnv });
  check("demo client seeded before syncing", seed.seeded);

  startApp("server", serverDir, serverPort, { ...serverEnv, SYNC_SECRET: secret });
  startApp("client", clientDir, clientPort, clientEnv);

  check("demo sync server answers", await waitFor(`http://127.0.0.1:${serverPort}/login`));
  check("desktop client answers", await waitFor(`http://127.0.0.1:${clientPort}/login`));

  const login = await fetch(`http://127.0.0.1:${clientPort}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "quentin@lexindiana.test", password: "IndianaLaw2026!" }),
  });
  check("demo account signs in", login.status === 200, `status ${login.status}`);
  const cookie = (login.headers.getSetCookie?.() ?? []).map((entry) => entry.split(";")[0]).join("; ");

  const status = await json(`http://127.0.0.1:${clientPort}/api/sync/status`, {
    headers: authed(cookie),
  });
  check("sync is enabled on the client", status.body?.enabled === true);
  const firmId = status.body?.firmId;
  check("status reports the firm", typeof firmId === "string" && firmId.length > 0);

  // 1. Bootstrap
  const firstRun = await json(`http://127.0.0.1:${clientPort}/api/sync/run`, {
    method: "POST",
    headers: authed(cookie),
    body: "{}",
  });
  check("first sync pass succeeds", firstRun.response.ok && !firstRun.body?.error, firstRun.body?.error);

  const serverFeed = await json(
    `http://127.0.0.1:${serverPort}/api/sync/pull?firmId=${firmId}&deviceId=observer`,
    { headers: { "x-sync-secret": secret } },
  );
  const bootstrapOps = serverFeed.body?.ops ?? [];
  check("server received the bootstrap snapshot", bootstrapOps.length > 0, `${bootstrapOps.length} ops`);
  check(
    "snapshot includes firm, staff, contacts, matters and tasks",
    ["Firm", "User", "Contact", "Matter", "Task"].every((entity) =>
      bootstrapOps.some((op) => op.entity === entity),
    ),
  );

  const taskOp = bootstrapOps.find((op) => op.entity === "Task");
  const remoteTask = taskOp ? JSON.parse(taskOp.payload) : null;
  check("a task payload is usable JSON", Boolean(remoteTask?.id && remoteTask?.title));

  // 2. Remote edit made on the server by another device
  const peerTitle = "Synced from the demo server";
  const peerPush = await json(`http://127.0.0.1:${serverPort}/api/sync/push`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-sync-secret": secret },
    body: JSON.stringify({
      firmId,
      deviceId: "peer-b",
      ops: [
        {
          id: randomUUID(),
          firmId,
          deviceId: "peer-b",
          entity: "Task",
          entityId: remoteTask.id,
          operation: "UPDATE",
          payload: JSON.stringify({
            ...remoteTask,
            title: peerTitle,
            updatedAt: new Date(Date.now() + 60_000).toISOString(),
          }),
          createdAt: new Date().toISOString(),
        },
      ],
    }),
  });
  check("server accepts a peer edit", peerPush.response.ok && peerPush.body?.applied === 1, JSON.stringify(peerPush.body));

  await json(`http://127.0.0.1:${clientPort}/api/sync/run`, {
    method: "POST",
    headers: authed(cookie),
    body: "{}",
  });
  const tasksAfterPull = await json(`http://127.0.0.1:${clientPort}/api/tasks`, { headers: authed(cookie) });
  check(
    "client applies the peer edit",
    (tasksAfterPull.body?.tasks ?? []).some((task) => task.title === peerTitle),
  );

  // 3. Conflict: client edits, then a newer server edit wins
  const clientTitle = "Client-side edit";
  const patch = await json(`http://127.0.0.1:${clientPort}/api/tasks/${remoteTask.id}`, {
    method: "PATCH",
    headers: authed(cookie),
    body: JSON.stringify({ title: clientTitle }),
  });
  check("client can edit the synced task", patch.response.ok, `status ${patch.response.status}`);

  const serverWinsTitle = "Server wins";
  const conflictingPush = await json(`http://127.0.0.1:${serverPort}/api/sync/push`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-sync-secret": secret },
    body: JSON.stringify({
      firmId,
      deviceId: "peer-c",
      ops: [
        {
          id: randomUUID(),
          firmId,
          deviceId: "peer-c",
          entity: "Task",
          entityId: remoteTask.id,
          operation: "UPDATE",
          payload: JSON.stringify({
            ...remoteTask,
            title: serverWinsTitle,
            updatedAt: new Date(Date.now() + 120_000).toISOString(),
          }),
          createdAt: new Date().toISOString(),
        },
      ],
    }),
  });
  check("server accepts the newer peer edit", conflictingPush.body?.applied === 1, JSON.stringify(conflictingPush.body));

  await json(`http://127.0.0.1:${clientPort}/api/sync/run`, {
    method: "POST",
    headers: authed(cookie),
    body: "{}",
  });

  const conflictedTasks = await json(`http://127.0.0.1:${clientPort}/api/tasks`, { headers: authed(cookie) });
  const resolved = (conflictedTasks.body?.tasks ?? []).find((task) => task.id === remoteTask.id);
  check("server version wins the conflict", resolved?.title === serverWinsTitle, resolved?.title);

  const conflictStatus = await json(`http://127.0.0.1:${clientPort}/api/sync/status`, {
    headers: authed(cookie),
  });
  check("losing local edit is recorded as a conflict", (conflictStatus.body?.conflicts ?? 0) >= 1);

  // 4. Offline behaviour
  const serverChild = children[0];
  serverChild.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 1_200));

  const offlineRun = await json(`http://127.0.0.1:${clientPort}/api/sync/run`, {
    method: "POST",
    headers: authed(cookie),
    body: "{}",
  });
  check("sync reports an error when the peer is down", offlineRun.response.status === 502, `status ${offlineRun.response.status}`);

  const offlineStatus = await json(`http://127.0.0.1:${clientPort}/api/sync/status`, {
    headers: authed(cookie),
  });
  check("status records the last sync error", typeof offlineStatus.body?.lastError === "string");

  const stillWorks = await fetch(`http://127.0.0.1:${clientPort}/tasks`, { headers: { cookie } });
  check("app keeps working offline", stillWorks.status === 200, `status ${stillWorks.status}`);
} catch (error) {
  failures += 1;
  console.error("FAIL  sync smoke threw:", error instanceof Error ? error.message : error);
} finally {
  for (const child of children) {
    if (child.pid && child.exitCode === null) {
      if (process.platform === "win32") {
        spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
      } else {
        child.kill("SIGTERM");
      }
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  rmSync(serverDir, { recursive: true, force: true });
  rmSync(clientDir, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\n${failures} sync smoke check(s) failed.`);
  process.exit(1);
}
console.log("\nSync smoke checks passed.");
