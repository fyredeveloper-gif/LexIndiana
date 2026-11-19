import { existsSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Next and OpenNext load .env files during the build. Some adapters also copy
// the project's env file into the Worker output, which would publish local
// development credentials. Keep build-time secrets in the process environment
// and remove local env files for the duration of the build.
const ENV_FILES = [".env", ".env.local", ".env.production", ".env.production.local"];
const PRIVATE_ENV = /^(DATABASE_URL|AUTH_SECRET|S3_ACCESS_KEY_ID|S3_SECRET_ACCESS_KEY|DEMO_PASSWORD|TEST_DATABASE_URL|TEST_DATABASE_SCHEMA)$/;
const buildEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !PRIVATE_ENV.test(key)),
);
const moved = [];
let tempDir;

function restore() {
  for (const { from, to } of moved.splice(0)) {
    if (existsSync(from)) renameSync(from, to);
  }
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", env: buildEnv });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
}

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
let exitCode = 0;

try {
  for (const file of ENV_FILES) {
    if (!existsSync(file)) continue;
    tempDir ??= mkdtempSync(path.join(tmpdir(), "lex-build-env-"));
    const target = path.join(tempDir, path.basename(file));
    renameSync(file, target);
    moved.push({ from: target, to: file });
  }

  run(npx, ["prisma", "generate"]);
  run(npx, ["next", "build"]);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  restore();
}

process.exit(exitCode);
