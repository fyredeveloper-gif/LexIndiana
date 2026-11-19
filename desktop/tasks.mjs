import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { environmentPaths } from "./paths.mjs";
import { demoPassword, DEMO_EMAIL, DEMO_FIRM_NAME } from "./runtime.mjs";

/**
 * Runs a Node script with the correct runtime. Inside Electron,
 * ELECTRON_RUN_AS_NODE makes process.execPath behave like plain Node, so the
 * packaged app does not depend on a system Node installation.
 */
function runNode(script, args, { env, cwd }) {
  return new Promise((resolve, reject) => {
    const childEnv = { ...process.env, ...env };
    if (process.versions.electron) childEnv.ELECTRON_RUN_AS_NODE = "1";
    const child = spawn(process.execPath, [script, ...args], {
      cwd,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    child.stdout?.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`${path.basename(script)} exited with ${code}:\n${output.slice(-4000)}`));
    });
  });
}

/**
 * Apply pending migrations for one environment. Safe to run on every launch:
 * Prisma is a no-op when the database is current.
 */
export async function migrateEnvironment({ appRoot, userDataDir, environment, baseEnv }) {
  const paths = environmentPaths(userDataDir, environment);
  mkdirSync(paths.storageRoot, { recursive: true });
  mkdirSync(paths.backupDir, { recursive: true });

  const cli = path.join(appRoot, "node_modules", "prisma", "build", "index.js");
  if (!existsSync(cli)) {
    throw new Error(
      "Prisma CLI is missing from the app bundle. Run `npm install` so `prisma` is a production dependency.",
    );
  }

  const fresh = !existsSync(paths.dbFile);
  await runNode(cli, ["migrate", "deploy"], {
    cwd: appRoot,
    env: { ...baseEnv, DATABASE_URL: paths.databaseUrl },
  });
  return { ...paths, fresh };
}

/**
 * Populate the DEMO repository on first launch (or after its database file is
 * removed). The seed is idempotent and never touches the LIVE repository.
 */
export async function seedDemoIfNeeded({ appRoot, paths, baseEnv }) {
  if (paths.environment !== "demo") return { seeded: false };
  if (existsSync(paths.seedMarker) && !paths.fresh) return { seeded: false };

  const bundle = path.join(appRoot, "desktop", "build", "seed-haynes.mjs");
  if (!existsSync(bundle)) {
    throw new Error(
      "Demo seed bundle missing. Run `npm run desktop:seed:bundle` (or start via `npm run desktop:dev`).",
    );
  }

  await runNode(bundle, [], {
    cwd: appRoot,
    env: {
      ...baseEnv,
      DATABASE_URL: paths.databaseUrl,
      DEMO_SEED_CONFIRM: "haynes-demo",
      DEMO_PASSWORD: demoPassword(),
      DEMO_EMAIL,
      DEMO_FIRM_NAME,
    },
  });

  mkdirSync(path.dirname(paths.seedMarker), { recursive: true });
  writeFileSync(paths.seedMarker, `${new Date().toISOString()}\n`);
  return { seeded: true };
}
