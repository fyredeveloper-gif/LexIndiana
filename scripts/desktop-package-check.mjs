import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Checks the tree electron-builder assembled, because a package can be built
 * successfully and still be missing files it does not consider part of the app.
 * Prisma's generated client is the known case: it lives in node_modules/.prisma,
 * which is not a package, and without it the app dies at startup with
 * "Cannot find module '.prisma/client/default'" before any window opens.
 */
const appDir = process.argv[2];
if (!appDir) {
  console.error("usage: node scripts/desktop-package-check.mjs <resources/app>");
  process.exit(2);
}

const required = [
  "package.json",
  "desktop/main.mjs",
  "desktop/server.mjs",
  "desktop/preload.cjs",
  "desktop/build/seed-haynes.mjs",
  "next.config.mjs",
  ".next/BUILD_ID",
  "prisma/schema.prisma",
  "node_modules/next/package.json",
  "node_modules/@prisma/client/package.json",
  "node_modules/.prisma/client/index.js",
  "node_modules/prisma/build/index.js",
];

const problems = required
  .filter((file) => !existsSync(path.join(appDir, file)))
  .map((file) => `missing ${file}`);

// The query engine is a platform-specific binary, so match the name rather than
// hard-coding the Linux or Windows file.
const engineDir = path.join(appDir, "node_modules", ".prisma", "client");
const engines = existsSync(engineDir)
  ? readdirSync(engineDir).filter((file) =>
      /^(libquery_engine-.+\.(so|dylib)\.node|query_engine-.+\.dll\.node)$/.test(file),
    )
  : [];
if (engines.length === 0) problems.push("missing the Prisma query engine in node_modules/.prisma/client");

// A local development database must never travel inside the installer.
for (const leak of ["prisma/dev.db", "prisma/dev.db-wal", "prisma/dev.db-shm"]) {
  if (existsSync(path.join(appDir, leak))) problems.push(`shipped a local database: ${leak}`);
}

if (problems.length > 0) {
  console.error(`[package-check] ${appDir}`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  `[package-check] ${appDir}: ${required.length} required paths present, engine ${engines.join(", ")}`,
);
