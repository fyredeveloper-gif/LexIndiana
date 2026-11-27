import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { expectedIdentity, inspectExe, readIco, yamlValue } from "./pe-metadata.mjs";

/**
 * Checks the identity a Windows build actually ships: the Version tab of every
 * exe and the icon it was stamped with.
 *
 * Both are invisible to the other checks. electron-builder derives the Windows
 * `CompanyName` from `package.json` `author` and `LegalCopyright` from the
 * `copyright` build option (default: "Copyright © <build year> <author>"), and
 * rcedit leaves whatever the Electron stub carried when a field is missing —
 * which is how a release shipped "GitHub, Inc." as its publisher. An icon path
 * that points nowhere is reported by electron-builder only as a log line. So
 * parse the resources of the built executables and compare them with the
 * committed identity and `assets/icon.ico`.
 *
 * Usage: node scripts/desktop-metadata-check.mjs [release-dir]
 */

const ROOT = path.resolve(import.meta.dirname, "..");
const RELEASE_DIR = process.argv[2] ?? "release";

// rcedit and makensis copy each image out of the .ico byte for byte, so the
// check can compare hashes instead of decoding and diffing pixels.
const ICON_FILE = path.join(ROOT, "assets", "icon.ico");
const BUILD_CONFIG = path.join(ROOT, "electron-builder.yml");

function exeFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".exe"))
    .map((entry) => path.join(dir, entry.name));
}

if (!existsSync(RELEASE_DIR)) {
  console.error(`[metadata-check] ${RELEASE_DIR} does not exist; run electron-builder first.`);
  process.exit(2);
}

// The unpacked exe lives in win-unpacked/, next to the two installers a user
// downloads; all three ship to users, so all three are checked.
const exes = [...exeFiles(RELEASE_DIR), ...exeFiles(path.join(RELEASE_DIR, "win-unpacked"))].sort();

if (exes.length === 0) {
  console.error(`[metadata-check] no .exe files in ${RELEASE_DIR} or ${RELEASE_DIR}/win-unpacked; run electron-builder first.`);
  process.exit(2);
}

const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
const buildConfigText = readFileSync(BUILD_CONFIG, "utf8");
const expected = expectedIdentity({
  pkg,
  buildConfig: {
    productName: yamlValue(buildConfigText, "productName"),
    copyright: yamlValue(buildConfigText, "copyright", { optional: true }),
  },
});
const ico = readIco(readFileSync(ICON_FILE));
const results = exes.map((file) => inspectExe(readFileSync(file), path.basename(file), expected, ico));
const problems = results.flatMap((result) => result.problems);

if (problems.length > 0) {
  console.error("[metadata-check] exe identity or icon does not match the committed sources:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

for (const result of results) console.log(`[metadata-check] ${result.summary}`);
console.log(
  `[metadata-check] ${results.length} executables carry "${expected.CompanyName}", ` +
    `"${expected.LegalCopyright}" and all ${ico.length} icon sizes`,
);
