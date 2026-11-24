import path from "node:path";

/**
 * Packaging targets, in the two vocabularies that have to agree: Node's
 * process.platform / process.arch (what desktop-package-check.mjs reasons in)
 * and electron-builder's (its --win/--mac/--linux and --x64/--arm64 flags, and
 * its output directories). Shared so desktop-build.mjs cannot hand the check a
 * tree built for one platform or architecture while claiming another.
 */

/** Canonical platform names, matching process.platform. */
export const PLATFORMS = ["win32", "darwin", "linux"];

/** Canonical architecture names, matching process.arch and electron-builder. */
export const ARCHITECTURES = ["x64", "arm64"];

/**
 * Prisma's name for each target, as written in binaryTargets. null where Prisma
 * publishes no engine: the Windows build is x86_64 only, whatever architecture
 * a package claims.
 *
 * @returns {string | null}
 */
export function prismaBinaryTarget(platform, arch) {
  if (platform === "win32" && arch === "x64") return "windows";
  if (platform === "darwin" && arch === "x64") return "darwin";
  if (platform === "darwin" && arch === "arm64") return "darwin-arm64";
  if (platform === "linux" && arch === "x64") return "debian-openssl-3.0.x";
  if (platform === "linux" && arch === "arm64") return "linux-arm64-openssl-3.0.x";
  return null;
}

// Forgiving on input, strict about the result: an operator typing "windows" gets
// the same check as --platform win32, and anything unrecognised gets null.
const PLATFORM_ALIASES = new Map([
  ["win", "win32"],
  ["windows", "win32"],
  ["win32", "win32"],
  ["mac", "darwin"],
  ["macos", "darwin"],
  ["osx", "darwin"],
  ["darwin", "darwin"],
  ["linux", "linux"],
]);

const ARCH_ALIASES = new Map([
  ["x64", "x64"],
  ["x86_64", "x64"],
  ["x86-64", "x64"],
  ["amd64", "x64"],
  ["arm64", "arm64"],
  ["aarch64", "arm64"],
]);

/** @returns {"win32" | "darwin" | "linux" | null} */
export function normalizePlatform(value) {
  if (typeof value !== "string") return null;
  return PLATFORM_ALIASES.get(value.trim().toLowerCase()) ?? null;
}

/** @returns {"x64" | "arm64" | null} */
export function normalizeArch(value) {
  if (typeof value !== "string") return null;
  return ARCH_ALIASES.get(value.trim().toLowerCase()) ?? null;
}

function pathSegments(target) {
  return path
    .resolve(target)
    .split(path.sep)
    .map((segment) => segment.toLowerCase());
}

/**
 * The platform and architecture an assembled app tree was built for, read from
 * electron-builder's output layout: release/win-unpacked/resources/app,
 * release/linux-arm64-unpacked/resources/app, and
 * release/mac[-arch]/<Product>.app/Contents/Resources/app.
 *
 * electron-builder leaves its default architecture out of the directory name
 * (win-unpacked, linux-unpacked, mac) and names the others (win-arm64-unpacked,
 * mac-arm64), so arch is null for a default build rather than "x64": only the
 * host or the build flags know which architecture that was.
 *
 * A directory only counts as the layout when it holds the resources/ or .app/
 * directory electron-builder puts there, so a checkout path that happens to
 * contain "mac-builds" is not mistaken for a macOS package. Returns null
 * outside the layout, so callers must decide rather than guess.
 *
 * @returns {{ platform: "win32" | "darwin" | "linux", arch: string | null } | null}
 */
export function treeTarget(appDir) {
  const segments = pathSegments(appDir);
  for (let i = 0; i < segments.length; i += 1) {
    const unpacked = /^(win|linux)(?:-([a-z0-9]+))?-unpacked$/.exec(segments[i]);
    if (unpacked && segments[i + 1] === "resources") {
      return {
        platform: unpacked[1] === "win" ? "win32" : "linux",
        arch: unpacked[2] ?? null,
      };
    }
    const mac = /^mac(?:-([a-z0-9]+))?$/.exec(segments[i]);
    if (mac && segments[i + 1]?.endsWith(".app")) {
      return { platform: "darwin", arch: mac[1] ?? null };
    }
  }
  return null;
}

/**
 * The platform of an assembled app tree, or null outside electron-builder's
 * output layout.
 *
 * @returns {"win32" | "darwin" | "linux" | null}
 */
export function platformForTree(appDir) {
  return treeTarget(appDir)?.platform ?? null;
}

/**
 * The architecture the tree's own directory names, or null when it names none
 * (the default build) or sits outside the layout. The raw suffix may be one
 * this tool does not package (ia32, universal, armv7l), so callers normalise it
 * and decide rather than guess.
 *
 * @returns {string | null}
 */
export function archForTree(appDir) {
  return treeTarget(appDir)?.arch ?? null;
}

/**
 * The platforms named by electron-builder's own arguments, so a cross build is
 * checked against what it was asked to produce rather than the host OS.
 * Empty when the build targets the host, which is electron-builder's default.
 *
 * @returns {Array<"win32" | "darwin" | "linux">}
 */
export function platformsFromElectronBuilderArgs(args) {
  const found = new Set();
  for (const arg of args) {
    if (arg === "--win" || arg === "--windows" || arg === "-w") found.add("win32");
    else if (arg === "--mac" || arg === "--macos" || arg === "-m") found.add("darwin");
    else if (arg === "--linux" || arg === "-l") found.add("linux");
  }
  return PLATFORMS.filter((platform) => found.has(platform));
}

/**
 * The architectures named by electron-builder's arguments. As with platforms,
 * empty means the build left it to the host (or to the target config).
 *
 * @returns {Array<"x64" | "arm64">}
 */
export function architecturesFromElectronBuilderArgs(args) {
  const found = new Set();
  for (const arg of args) {
    if (arg === "--x64") found.add("x64");
    else if (arg === "--arm64") found.add("arm64");
  }
  return ARCHITECTURES.filter((arch) => found.has(arch));
}
