import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { rm } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";

export type RunningNextServer = {
  baseUrl: string;
  stop: () => Promise<void>;
};

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a test port."));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

function killTree(child: ChildProcess, signal: NodeJS.Signals) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

/**
 * Build a production Next app into an isolated dist directory, then serve it
 * with `next start` against the test schema. The separate directory keeps the
 * normal `.next` preview build untouched.
 */
export async function startNextServer(env: Record<string, string | undefined>): Promise<RunningNextServer> {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const distDir = ".next-e2e";
  const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const serverEnv = {
    ...process.env,
    ...env,
    APP_URL: baseUrl,
    NEXT_DIST_DIR: distDir,
    NEXT_TELEMETRY_DISABLED: "1",
  };

  try {
    execFileSync(process.execPath, [nextBin, "build"], {
      cwd: process.cwd(),
      env: serverEnv,
      stdio: "pipe",
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    await rm(path.join(process.cwd(), distDir), { recursive: true, force: true });
    const output =
      typeof error === "object" && error !== null && "stdout" in error
        ? String((error as { stdout?: Buffer }).stdout ?? "")
        : String(error);
    throw new Error(`Next production build for E2E failed:\n${output.slice(-4000)}`);
  }

  const child = spawn(process.execPath, [nextBin, "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: process.cwd(),
    detached: true,
    env: serverEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next test server exited with ${child.exitCode}:\n${output.slice(-4000)}`);
    }
    try {
      const response = await fetch(`${baseUrl}/login`, { signal: AbortSignal.timeout(5_000) });
      if (response.ok) {
        return {
          baseUrl,
          stop: async () => {
            killTree(child, "SIGTERM");
            await new Promise((resolve) => setTimeout(resolve, 1_500));
            killTree(child, "SIGKILL");
            await rm(path.join(process.cwd(), distDir), { recursive: true, force: true });
          },
        };
      }
    } catch {
      // The server is still compiling or not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  killTree(child, "SIGKILL");
  await rm(path.join(process.cwd(), distDir), { recursive: true, force: true });
  throw new Error(`Next test server did not become ready:\n${output.slice(-4000)}`);
}
