import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { demoPassword, DEMO_EMAIL } from "../desktop/runtime.mjs";

/**
 * Helpers shared by scripts/desktop-smoke.mjs (the repo build) and
 * scripts/desktop-package-smoke.mjs (a packaged app tree). Both drive the same
 * embedded server and sign in as the seeded demo user; only the app root and
 * the checks around them differ.
 */

export function createChecker() {
  let failures = 0;
  return {
    check(label, condition, detail = "") {
      if (condition) {
        console.log(`PASS  ${label}`);
      } else {
        failures += 1;
        console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
      }
    },
    get failures() {
      return failures;
    },
  };
}

export function freePort() {
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

export async function waitFor(url, timeoutMs = 90_000) {
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

/**
 * Starts desktop/server.mjs from `appDir`, which may be this repo or the
 * resources/app directory of an unpacked build.
 */
export function startDesktopServer({ appDir, env, port }) {
  const child = spawn(process.execPath, [path.join(appDir, "desktop", "server.mjs")], {
    cwd: appDir,
    env: { ...process.env, ...env, LEX_APP_ROOT: appDir, LEX_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let log = "";
  let stopped = false;
  child.stdout?.on("data", (chunk) => {
    log += chunk.toString();
  });
  child.stderr?.on("data", (chunk) => {
    log += chunk.toString();
  });
  return {
    log: () => log,
    /** Idempotent, so a check that stops the server early can still run the
     * shared cleanup in `finally`. */
    stop() {
      if (stopped || !child.pid) return;
      stopped = true;
      if (process.platform === "win32") {
        spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
      } else {
        child.kill("SIGTERM");
      }
    },
  };
}

/** Signs in and returns the session cookie as a request header value. */
export async function signIn(baseUrl, email, password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const cookie = (response.headers.getSetCookie?.() ?? [])
    .map((entry) => entry.split(";")[0])
    .join("; ");
  return { status: response.status, cookie };
}

/** Signs in as the seeded demo account. */
export function signInAsDemo(baseUrl) {
  return signIn(baseUrl, DEMO_EMAIL, demoPassword());
}
