import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Checks the tree electron-builder assembled, because a package can be built
 * successfully and still be missing files it does not consider part of the app.
 * Prisma's generated client is the known case: it lives in node_modules/.prisma,
 * which is not a package, and without it the app dies at startup with
 * "Cannot find module '.prisma/client/default'" before any window opens.
 *
 * Usage: node scripts/desktop-package-check.mjs <resources/app> [--platform <win32|darwin|linux>]
 *
 * --platform defaults to the host, which is what electron-builder targets when
 * it is run without a platform flag. Pass it explicitly when packaging for
 * another platform, or from a runner whose OS is not the target OS.
 */

/** Query engine file names Prisma generates for each platform. */
const ENGINE_PATTERNS = {
  win32: [/^query_engine-windows\.dll\.node$/],
  // libquery_engine-darwin.dylib.node on Intel, -darwin-arm64 on Apple silicon.
  darwin: [/^libquery_engine-darwin(-arm64)?\.dylib\.node$/],
  // Linux binaries are suffixed with the libc and OpenSSL ABI they link against
  // (debian-openssl-3.0.x, rhel-openssl-1.1.x, linux-musl-...), so any of them
  // is a valid Linux engine.
  linux: [/^libquery_engine(-.+)?\.so\.node$/],
};

/** Any Prisma query engine, whatever platform it was built for. */
function isQueryEngine(file) {
  return /^(libquery_engine(-.+)?\.(so|dylib)|query_engine-.+\.dll)\.node$/.test(file);
}

const args = process.argv.slice(2);
let appDir = "";
let platform = "";
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--platform") {
    platform = args[i + 1] ?? "";
    i += 1;
  } else if (!appDir) {
    appDir = args[i];
  } else {
    appDir = "";
    break;
  }
}
platform = platform || process.platform;

if (!appDir || !(platform in ENGINE_PATTERNS)) {
  console.error(
    "usage: node scripts/desktop-package-check.mjs <resources/app> [--platform <win32|darwin|linux>]",
  );
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

// The query engine is a platform-specific binary and Prisma names it after the
// platform it was generated for, so the name has to match the target rather than
// merely exist. A package built on the wrong OS still holds an engine -- just not
// one that loads there -- and that failure would otherwise surface only when
// someone launches the installed app or the packaged smoke boots it.
const engineDir = path.join(appDir, "node_modules", ".prisma", "client");
const present = existsSync(engineDir)
  ? readdirSync(engineDir).filter((file) => isQueryEngine(file))
  : [];
const engines = present.filter((file) =>
  ENGINE_PATTERNS[platform].some((pattern) => pattern.test(file)),
);

if (engines.length === 0) {
  problems.push(
    present.length === 0
      ? `missing the Prisma query engine for ${platform} in node_modules/.prisma/client`
      : `Prisma query engine does not match the ${platform} target: found ${present.join(", ")}. ` +
        `Rebuild on ${platform}, or add a "${platform}" entry to binaryTargets in prisma/schema.prisma.`,
  );
}

// A local development database must never travel inside the installer.
for (const leak of ["prisma/dev.db", "prisma/dev.db-wal", "prisma/dev.db-shm"]) {
  if (existsSync(path.join(appDir, leak))) problems.push(`shipped a local database: ${leak}`);
}

if (problems.length > 0) {
  console.error(`[package-check] ${appDir} (target ${platform})`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  `[package-check] ${appDir}: ${required.length} required paths present, ${platform} engine ${engines.join(", ")}`,
);
