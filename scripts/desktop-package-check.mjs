import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  ARCHITECTURES,
  PLATFORMS,
  archForTree,
  normalizeArch,
  normalizePlatform,
  platformForTree,
  prismaBinaryTarget,
} from "./packaged-platforms.mjs";

/**
 * Checks the tree electron-builder assembled, because a package can be built
 * successfully and still be missing files it does not consider part of the app.
 * Prisma's generated client is the known case: it lives in node_modules/.prisma,
 * which is not a package, and without it the app dies at startup with
 * "Cannot find module '.prisma/client/default'" before any window opens.
 *
 * Usage: node scripts/desktop-package-check.mjs <resources/app>
 *          [--platform <win32|darwin|linux>] [--arch <x64|arm64>]
 *
 * The target is, in order: --platform and --arch, the electron-builder output
 * directory the tree sits in (release/win-unpacked, release/mac-arm64,
 * release/linux-arm64-unpacked), then the host. electron-builder targets the
 * host unless told otherwise, so the directory is what makes a cross build check
 * itself against the right target. A flag that contradicts the directory is an
 * error: one of the two is wrong, and guessing which would defeat the check.
 */

/**
 * Query engine file names Prisma generates for each target. The name carries the
 * architecture as well as the platform, so it is the one place a package built
 * for one target reveals that it holds another target's engine: an arm64 engine
 * is as unloadable in an x64 app as a macOS engine is on Windows.
 */
const ENGINE_PATTERNS = {
  // Prisma builds one Windows engine and it is x86_64 only.
  "win32/x64": [/^query_engine-windows\.dll\.node$/],
  // libquery_engine-darwin.dylib.node on Intel, -darwin-arm64 on Apple silicon.
  "darwin/x64": [/^libquery_engine-darwin\.dylib\.node$/],
  "darwin/arm64": [/^libquery_engine-darwin-arm64\.dylib\.node$/],
  // Linux engines are suffixed with the libc and OpenSSL ABI they link against
  // (debian-openssl-3.0.x, rhel-openssl-1.1.x, linux-musl-...), so any of them is
  // a valid Linux engine for its architecture; arm64 ones name the architecture
  // too (linux-arm64-openssl-3.0.x), and 32-bit arm has no x64 suffix at all.
  "linux/x64": [/^libquery_engine-(?!.*arm)[a-z0-9.-]+\.so\.node$/],
  "linux/arm64": [/^libquery_engine-(?=.*arm64)[a-z0-9.-]+\.so\.node$/],
};

const USAGE =
  "usage: node scripts/desktop-package-check.mjs <resources/app> " +
  "[--platform <win32|darwin|linux>] [--arch <x64|arm64>]";

/** Any Prisma query engine, whatever target it was built for. */
function isQueryEngine(file) {
  return /^(libquery_engine(-.+)?\.(so|dylib)|query_engine-.+\.dll)\.node$/.test(file);
}

function usage(message) {
  console.error(message ? `${message}\n${USAGE}` : USAGE);
  process.exit(2);
}

const args = process.argv.slice(2);
let appDir = "";
/** null means the flag was not given, so the tree or the host decides. */
let requestedPlatform = null;
let requestedArch = null;
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--platform") {
    // A flag with no value must not quietly fall back to the host: that is the
    // wrong-target check this script exists to prevent.
    requestedPlatform = normalizePlatform(args[i + 1]);
    i += 1;
    if (!requestedPlatform) usage(`--platform needs one of ${PLATFORMS.join(", ")}.`);
  } else if (arg === "--arch") {
    requestedArch = normalizeArch(args[i + 1]);
    i += 1;
    if (!requestedArch) usage(`--arch needs one of ${ARCHITECTURES.join(", ")}.`);
  } else if (arg.startsWith("-")) {
    usage(`unknown option ${arg}`);
  } else if (appDir) {
    usage(`unexpected argument ${arg}`);
  } else {
    appDir = arg;
  }
}

if (!appDir) usage();

const treePlatform = platformForTree(appDir);
// The directory names an architecture only when it is not electron-builder's
// default, so an unsuffixed tree (win-unpacked) leaves it to the host.
const treeArchName = archForTree(appDir);
const treeArch = treeArchName ? normalizeArch(treeArchName) : null;
if (treeArchName && !treeArch) {
  usage(
    `${appDir} is named for architecture "${treeArchName}", which is not one of ${ARCHITECTURES.join(", ")}. ` +
      `Check the tree for an ${ARCHITECTURES.join(" or ")} build; the engine of a "${treeArchName}" package cannot be verified here.`,
  );
}
if (requestedPlatform && treePlatform && requestedPlatform !== treePlatform) {
  usage(`${appDir} is a ${treePlatform} tree, but --platform says ${requestedPlatform}.`);
}
if (requestedArch && treeArch && requestedArch !== treeArch) {
  usage(`${appDir} is an ${treeArch} tree, but --arch says ${requestedArch}.`);
}

const platform = requestedPlatform ?? treePlatform ?? normalizePlatform(process.platform);
if (!platform) {
  usage(
    `${appDir} is not an electron-builder output tree and ${process.platform} is not a packaging target, so the target platform cannot be inferred.`,
  );
}
const arch = requestedArch ?? treeArch ?? normalizeArch(process.arch);
if (!arch) {
  usage(
    `${appDir} does not name an architecture and ${process.arch} is not a packaging target, so the target architecture cannot be inferred.`,
  );
}
const target = `${platform}/${arch}`;

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

// The query engine is a target-specific binary and Prisma names it after the
// platform and architecture it was generated for, so the name has to match the
// target rather than merely exist. A package built on the wrong OS or for the
// wrong CPU still holds an engine -- just not one that loads there -- and that
// failure would otherwise surface only when someone launches the installed app
// or the packaged smoke boots it.
const engineDir = path.join(appDir, "node_modules", ".prisma", "client");
const present = existsSync(engineDir)
  ? readdirSync(engineDir).filter((file) => isQueryEngine(file))
  : [];
const patterns = ENGINE_PATTERNS[target];
const engines = patterns ? present.filter((file) => patterns.some((pattern) => pattern.test(file))) : [];

if (!patterns) {
  problems.push(
    `Prisma publishes no ${arch} query engine for ${platform}: ` +
      `"${prismaBinaryTarget(platform, "x64")}" is x86_64 only. Package ${platform} x64 instead.`,
  );
} else if (engines.length === 0) {
  problems.push(
    present.length === 0
      ? `missing the Prisma query engine for ${target} in node_modules/.prisma/client`
      : `Prisma query engine does not match the ${target} target: found ${present.join(", ")}. ` +
        `Build for ${platform} ${arch}, or add "${prismaBinaryTarget(platform, arch)}" to binaryTargets in prisma/schema.prisma.`,
  );
}

// A local development database must never travel inside the installer.
for (const leak of ["prisma/dev.db", "prisma/dev.db-wal", "prisma/dev.db-shm"]) {
  if (existsSync(path.join(appDir, leak))) problems.push(`shipped a local database: ${leak}`);
}

if (problems.length > 0) {
  console.error(`[package-check] ${appDir} (target ${target})`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  `[package-check] ${appDir}: ${required.length} required paths present, ${target} engine ${engines.join(", ")}`,
);
