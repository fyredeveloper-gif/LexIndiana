import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { readConfig } from "../desktop/config.mjs";
import { devUserDataDir } from "../desktop/paths.mjs";
import { desktopServerEnv } from "../desktop/runtime.mjs";
import { migrateEnvironment, seedDemoIfNeeded } from "../desktop/tasks.mjs";

const appRoot = process.cwd();
const pkg = JSON.parse(readFileSync(path.join(appRoot, "package.json"), "utf8"));
const appName = pkg.productName || pkg.name;
const userDataDir = devUserDataDir(appName);
const config = readConfig(userDataDir);

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        probe.close();
        reject(new Error("Could not allocate a local port."));
        return;
      }
      probe.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

async function waitForServer(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // Still compiling.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("next dev did not become ready.");
}

const port = await freePort();
const env = desktopServerEnv({
  userDataDir,
  environment: config.environment,
  port,
  authSecret: config.authSecret,
  sync: config.sync,
  deviceId: config.deviceId,
});

console.log(`[desktop:dev] environment=${config.environment} data=${userDataDir}`);

const seedBundle = path.join(appRoot, "desktop", "build", "seed-haynes.mjs");
if (!existsSync(seedBundle)) {
  console.log("[desktop:dev] building demo seed bundle");
  execFileSync(process.execPath, [path.join("scripts", "desktop-seed-bundle.mjs")], {
    cwd: appRoot,
    stdio: "inherit",
  });
}

const paths = await migrateEnvironment({ appRoot, userDataDir, environment: config.environment, baseEnv: env });
await seedDemoIfNeeded({ appRoot, paths, baseEnv: env });
console.log(`[desktop:dev] database=${paths.dbFile}`);

const nextBin = path.join(appRoot, "node_modules", "next", "dist", "bin", "next");
const devServer = spawn(process.execPath, [nextBin, "dev", "-H", "127.0.0.1", "-p", String(port)], {
  cwd: appRoot,
  env: { ...process.env, ...env },
  stdio: "inherit",
  windowsHide: true,
});

const require = createRequire(path.join(appRoot, "package.json"));
let electronPath;
try {
  electronPath = require("electron");
} catch {
  console.error(
    "[desktop:dev] Electron is not installed correctly. Run `npm install` (its postinstall downloads the binary).",
  );
  devServer.kill();
  process.exit(1);
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  devServer.kill();
  setTimeout(() => process.exit(code), 300);
}

await waitForServer(`http://127.0.0.1:${port}/login`);
console.log(`[desktop:dev] next dev ready at http://127.0.0.1:${port}`);

const electron = spawn(electronPath, [appRoot], {
  cwd: appRoot,
  env: { ...process.env, ...env, LEX_DEV_SERVER_URL: `http://127.0.0.1:${port}` },
  stdio: "inherit",
  windowsHide: false,
});

electron.on("exit", (code) => shutdown(code ?? 0));
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
