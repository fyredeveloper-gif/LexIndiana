import { closeSync, existsSync, openSync, readSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Checks the Windows artifacts a person downloads, installs and runs.
 *
 * electron-builder reports success for `--dir` (no installer at all), and two
 * Windows targets that share an artifact name overwrite each other's file, so a
 * green packaging run can still leave nothing usable to hand to a user. This
 * asserts that the NSIS installer and the portable exe both exist, are real
 * Windows executables, and are large enough to contain the app.
 *
 * Usage: node scripts/desktop-installer-check.mjs [release-dir]
 */

const RELEASE_DIR = process.argv[2] ?? "release";
// Far below any real installer (the app tree is hundreds of MB) and far above a
// truncated or stub file.
const MIN_INSTALLER_BYTES = 5 * 1024 * 1024;

function megabytes(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Every PE file starts with "MZ"; read two bytes instead of the whole file. */
function startsWithMz(file) {
  const fd = openSync(file, "r");
  try {
    const magic = Buffer.alloc(2);
    readSync(fd, magic, 0, 2, 0);
    return magic.toString("latin1") === "MZ";
  } finally {
    closeSync(fd);
  }
}

function exeFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".exe"))
    .map((entry) => entry.name)
    .sort();
}

if (!existsSync(RELEASE_DIR)) {
  console.error(`[installer-check] ${RELEASE_DIR} does not exist; run electron-builder first.`);
  process.exit(2);
}

const problems = [];
const installers = exeFiles(RELEASE_DIR);

// The unpacked exe sits inside win-unpacked/, so only the top level holds the
// artifacts a user downloads.
for (const name of installers) {
  const file = path.join(RELEASE_DIR, name);
  const { size } = statSync(file);
  if (!startsWithMz(file)) problems.push(`not a Windows executable: ${name}`);
  else if (size < MIN_INSTALLER_BYTES) problems.push(`too small to contain the app (${megabytes(size)}): ${name}`);
}
if (installers.length < 2) {
  problems.push(
    `expected the NSIS installer and the portable exe in ${RELEASE_DIR}/, found ${installers.length}` +
      (installers.length > 0 ? ` (${installers.join(", ")})` : "") +
      '. Build with both "nsis" and "portable" in win.target.',
  );
}

const unpackedDir = path.join(RELEASE_DIR, "win-unpacked");
const unpackedExe = exeFiles(unpackedDir);
if (unpackedExe.length === 0) problems.push(`missing the unpacked app executable in ${unpackedDir}/`);

if (problems.length > 0) {
  console.error(`[installer-check] ${RELEASE_DIR}`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

for (const name of installers) {
  console.log(`[installer-check] ${name}: ${megabytes(statSync(path.join(RELEASE_DIR, name)).size)}`);
}
console.log(`[installer-check] ${installers.length} installers and unpacked app ${unpackedExe[0]} present`);
