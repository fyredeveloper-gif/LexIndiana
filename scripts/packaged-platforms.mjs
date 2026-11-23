import path from "node:path";

/**
 * Packaging platforms, in the two vocabularies that have to agree: Node's
 * process.platform (what desktop-package-check.mjs reasons in) and
 * electron-builder's (its --win/--mac/--linux flags and its output directories).
 * Shared so desktop-build.mjs cannot hand the check a tree from one platform
 * while claiming another.
 */

/** Canonical platform names, matching process.platform. */
export const PLATFORMS = ["win32", "darwin", "linux"];

/** Prisma's name for each platform, as written in binaryTargets. */
export const PRISMA_BINARY_TARGET = {
  win32: "windows",
  darwin: "darwin",
  linux: "debian-openssl-3.0.x",
};

// Forgiving on input, strict about the result: an operator typing "windows" gets
// the same check as --platform win32, and anything unrecognised gets null.
const ALIASES = new Map([
  ["win", "win32"],
  ["windows", "win32"],
  ["win32", "win32"],
  ["mac", "darwin"],
  ["macos", "darwin"],
  ["osx", "darwin"],
  ["darwin", "darwin"],
  ["linux", "linux"],
]);

/** @returns {"win32" | "darwin" | "linux" | null} */
export function normalizePlatform(value) {
  if (typeof value !== "string") return null;
  return ALIASES.get(value.trim().toLowerCase()) ?? null;
}

/**
 * The platform an assembled app tree was built for, read from electron-builder's
 * output layout: release/win-unpacked/..., release/linux-unpacked/... and
 * release/mac[-arch]/<Product>.app/Contents/Resources/app. Returns null for a
 * tree outside that layout, so callers must decide rather than guess.
 *
 * @returns {"win32" | "darwin" | "linux" | null}
 */
export function platformForTree(appDir) {
  const segments = path
    .resolve(appDir)
    .split(path.sep)
    .map((segment) => segment.toLowerCase());

  if (segments.some((segment) => /^win(-[a-z0-9]+)?-unpacked$/.test(segment))) return "win32";
  if (segments.some((segment) => /^linux(-[a-z0-9]+)?-unpacked$/.test(segment))) return "linux";
  if (segments.some((segment) => /^mac(-[a-z0-9]+)?$/.test(segment) || segment.endsWith(".app"))) {
    return "darwin";
  }
  return null;
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
