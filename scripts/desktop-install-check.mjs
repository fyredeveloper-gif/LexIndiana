import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expectedIdentity, inspectExe, readIco, yamlValue } from "./pe-metadata.mjs";

/**
 * Installs the NSIS build the way a user does, launches the installed exe,
 * and uninstalls it again.
 *
 * Every other Windows check judges files on disk: the layout check reads the
 * unpacked tree, the packaged smoke boots it with node, and the installer and
 * metadata checks parse the exes byte by byte. None of them runs an installer,
 * so the things that only exist after an install go unverified -- whether the
 * per-user installer really lands in %LOCALAPPDATA%\Programs, whether the
 * Start-menu shortcut points at the exe it just wrote, whether the installed
 * app starts at all, and whether uninstalling honors
 * `deleteAppDataOnUninstall: false` and leaves a firm's database alone.
 *
 * Windows only: it drives the real installer and app, so there is nothing to
 * assert on another platform.
 *
 * Usage: node scripts/desktop-install-check.mjs [release-dir]
 */
// First launch migrates a fresh database and seeds the demo firm, which takes
// longer than packaging does on a cold runner.
const LAUNCH_TIMEOUT_MS = 5 * 60_000;
const INSTALL_TIMEOUT_MS = 5 * 60_000;
const UNINSTALL_TIMEOUT_MS = 3 * 60_000;

const RELEASE_DIR = path.resolve(process.argv[2] ?? "release");
const ROOT = path.resolve(import.meta.dirname, "..");

if (process.platform !== "win32") {
  console.error("[install-check] this check installs a Windows app; run it on Windows");
  process.exit(2);
}
if (!existsSync(RELEASE_DIR)) {
  console.error(`[install-check] ${RELEASE_DIR} does not exist; run electron-builder first.`);
  process.exit(2);
}

/** Everything printed by this check, so a failure reads like the other checks. */
const say = (message) => console.log(`[install-check] ${message}`);

/** Set from the build config once it is read; used to clean up after a failure. */
let exeName = "";

function fail(message) {
  console.error(`[install-check] ${message}`);
  // process.exit skips `finally`, so a failure after the app was launched would
  // otherwise leave a window open on the runner for the rest of the job.
  if (exeName !== "") spawnSync("taskkill", ["/IM", exeName, "/T", "/F"], { stdio: "ignore", windowsHide: true });
  process.exit(1);
}

function must(condition, message) {
  if (!condition) fail(message);
  return condition;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs a command to completion; NSIS installers detach, so callers poll after. */
function runCommand(file, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(file, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr?.on("data", (chunk) => (stderr += chunk.toString()));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: `${stderr}${error.message}` });
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/**
 * A scalar inside a one-level block, for `nsis.shortcutName`, since `yamlValue`
 * only reads top-level keys. The block ends at the next line in column 0; its
 * own indentation is stripped so `yamlValue` can read it unchanged.
 */
function yamlSectionValue(text, section, key) {
  const header = new RegExp(`^${section}:[ \\t]*$`, "m").exec(text);
  if (header == null) return null;
  const rest = text.slice(header.index + header[0].length);
  const end = rest.search(/^\S/m);
  const block = (end === -1 ? rest : rest.slice(0, end)).replace(/^[ \t]+/gm, "");
  return yamlValue(block, key, { optional: true });
}

/** Polls until `predicate` holds, failing the step instead of hanging. */
async function waitFor(description, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await sleep(1000);
  }
  fail(`${description} did not happen within ${Math.round(timeoutMs / 1000)}s`);
}

/** Start-menu and desktop shortcuts are ".lnk" files; only COM resolves their target. */
function shortcutTarget(lnk) {
  const command =
    "$sh = New-Object -ComObject WScript.Shell; " +
    `$s = $sh.CreateShortcut('${lnk.replace(/'/g, "''")}'); ` +
    "[pscustomobject]@{ TargetPath = $s.TargetPath; Arguments = $s.Arguments } | ConvertTo-Json -Compress";
  const result = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", command], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) return null;
  try {
    return JSON.parse(result.stdout.trim());
  } catch {
    return null;
  }
}

/** Resolved through the shell so a redirected Desktop on a runner still works. */
function desktopDir(fallback) {
  const result = spawnSync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-Command", "[Environment]::GetFolderPath('Desktop')"],
    { encoding: "utf8", windowsHide: true },
  );
  const resolved = result.status === 0 ? result.stdout.trim() : "";
  return resolved === "" ? fallback : resolved;
}

/** Windows paths are case-insensitive, and a shortcut stores its own spelling. */
function samePath(left, right) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function listDir(dir) {
  if (!existsSync(dir)) return "";
  return readdirSync(dir).join(", ") || "(empty)";
}

/**
 * An earlier run of this job, or a preinstalled copy of the app on the image,
 * would make the install assertions meaningless (the exe could already be
 * there) and would hide whether uninstalling keeps user data.
 */
function assertCleanStart(paths) {
  const existing = [paths.installDir, paths.startMenuShortcut].filter((entry) => existsSync(entry));
  if (existing.length > 0) fail(`the runner already has ${existing.join(", ")}; remove it and rerun`);
  if (existsSync(paths.userDataDir)) fail(`the runner already has ${paths.userDataDir}; remove it and rerun`);
}

// Every install-time name is derived, never restated here: electron-builder
// builds the install folder, exe, uninstaller and shortcut names from
// `productName` and `nsis.shortcutName`, and Electron builds userData from
// package.json, so a rename must not leave this check asserting the previous
// release's paths.
let PRODUCT_NAME;
let SHORTCUT_NAME;
let USER_DATA_DIR_NAME;
let pkg;
let buildConfigText;
try {
  buildConfigText = readFileSync(path.join(ROOT, "electron-builder.yml"), "utf8");
  pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
  PRODUCT_NAME = yamlValue(buildConfigText, "productName");
  // electron-builder falls back to productName when shortcutName is unset.
  SHORTCUT_NAME = yamlSectionValue(buildConfigText, "nsis", "shortcutName") ?? PRODUCT_NAME;
  // `app.getName()` prefers package.json `productName` over `name`, and the
  // packaged package.json keeps whichever of them this repo has.
  USER_DATA_DIR_NAME = pkg.productName ?? pkg.name;
  exeName = `${PRODUCT_NAME}.exe`;
} catch (error) {
  fail(`could not derive the product identity: ${error instanceof Error ? error.message : String(error)}`);
}

async function main() {
  const installer = readdirSync(RELEASE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /Setup .*\.exe$/i.test(entry.name))
    .map((entry) => path.join(RELEASE_DIR, entry.name));
  if (installer.length !== 1) {
    fail(
      `expected one NSIS installer in ${RELEASE_DIR}, found ${installer.length}` +
        (installer.length > 0 ? ` (${installer.map((file) => path.basename(file)).join(", ")})` : ""),
    );
  }

  const localAppData = process.env.LOCALAPPDATA;
  const appData = process.env.APPDATA;
  must(localAppData && appData, "LOCALAPPDATA and APPDATA must be set; run this in a normal user session");

  const shortcuts = `${SHORTCUT_NAME}.lnk`;
  const paths = {
    // electron-builder's per-user NSIS target: no admin prompt, no Program Files.
    installDir: path.join(localAppData, "Programs", PRODUCT_NAME),
    startMenuShortcut: path.join(appData, "Microsoft", "Windows", "Start Menu", "Programs", shortcuts),
    shortcutName: shortcuts,
    desktopShortcut: path.join(desktopDir(path.join(appData, "..", "Desktop")), shortcuts),
    userDataDir: path.join(appData, USER_DATA_DIR_NAME),
  };
  paths.installedExe = path.join(paths.installDir, exeName);
  paths.uninstaller = path.join(paths.installDir, `Uninstall ${exeName}`);
  paths.dataRoot = path.join(paths.userDataDir, "data");
  paths.demoDb = path.join(paths.dataRoot, "demo", "lex-indiana.db");
  paths.seedMarker = path.join(paths.dataRoot, "demo", ".seeded");
  paths.configFile = path.join(paths.userDataDir, "desktop.config.json");
  paths.survivorMarker = path.join(paths.dataRoot, "install-check-marker.txt");

  say(`product "${PRODUCT_NAME}", shortcut "${paths.shortcutName}", data folder "${USER_DATA_DIR_NAME}"`);
  assertCleanStart(paths);

  // --- install ------------------------------------------------------------
  say(`installing ${path.basename(installer[0])} silently`);
  const install = await runCommand(installer[0], ["/S"], INSTALL_TIMEOUT_MS);
  must(install.code === 0, `the installer exited with code ${install.code}${install.stderr ? `: ${install.stderr.trim()}` : ""}`);

  // runAfterFinish can leave the app running right after a silent install; a
  // running copy would hold the single-instance lock and make our own launch
  // exit immediately.
  spawnSync("taskkill", ["/IM", exeName, "/T", "/F"], { stdio: "ignore", windowsHide: true });

  await waitFor(`the installed app at ${paths.installedExe}`, () => existsSync(paths.installedExe), INSTALL_TIMEOUT_MS);
  must(existsSync(paths.uninstaller), `the installer did not write an uninstaller to ${paths.installDir}`);
  say(`install folder ${paths.installDir}`);

  // --- the shortcut a user clicks ----------------------------------------
  must(existsSync(paths.startMenuShortcut), `no Start-menu shortcut at ${paths.startMenuShortcut}`);
  const shortcut = shortcutTarget(paths.startMenuShortcut);
  must(shortcut != null, `could not read the Start-menu shortcut ${paths.startMenuShortcut}`);
  must(
    shortcut.TargetPath !== "" && samePath(shortcut.TargetPath, paths.installedExe),
    `the Start-menu shortcut points at ${JSON.stringify(shortcut.TargetPath)}, expected ${paths.installedExe}`,
  );
  say(`Start-menu shortcut "${paths.shortcutName}" -> ${shortcut.TargetPath}`);

  // electron-builder creates a desktop shortcut too, but the desktop folder can
  // be redirected on a runner, so only its target is checked when it is there.
  if (existsSync(paths.desktopShortcut)) {
    const desktop = shortcutTarget(paths.desktopShortcut);
    must(
      desktop != null && samePath(desktop.TargetPath, paths.installedExe),
      `the desktop shortcut points at ${JSON.stringify(desktop?.TargetPath)}, expected ${paths.installedExe}`,
    );
    say(`desktop shortcut -> ${desktop.TargetPath}`);
  }

  // The installer copies the exe the packaging job built; assert the installed
  // copy is still that build instead of trusting the copy step.
  const expected = expectedIdentity({
    pkg,
    buildConfig: {
      productName: PRODUCT_NAME,
      copyright: yamlValue(buildConfigText, "copyright", { optional: true }),
    },
  });
  const inspected = inspectExe(readFileSync(paths.installedExe), path.basename(paths.installedExe), expected, readIco(readFileSync(path.join(ROOT, "assets", "icon.ico"))));
  must(inspected.problems.length === 0, `the installed exe is not the build packaging produced:\n  - ${inspected.problems.join("\n  - ")}`);
  say(`installed exe ${inspected.summary}`);

  // --- launch the installed exe ------------------------------------------
  const launched = spawn(paths.installedExe, [], { stdio: ["ignore", "ignore", "pipe"], windowsHide: false });
  let exit = null;
  launched.on("error", (error) => (exit = { code: error.message, signal: null }));
  launched.on("exit", (code, signal) => (exit = { code, signal }));
  let stderr = "";
  launched.stderr?.on("data", (chunk) => (stderr += chunk.toString()));

  // The database, the seed marker and the settings file are all written before
  // any window loads, so they prove the installed app started and ran its
  // startup path -- without needing a screenshot or a UI driver on the runner.
  const startupDone = () =>
    existsSync(paths.demoDb) && existsSync(paths.seedMarker) && existsSync(paths.configFile);
  const launchDeadline = Date.now() + LAUNCH_TIMEOUT_MS;
  while (Date.now() < launchDeadline && !startupDone() && !exit) await sleep(1000);
  if (!existsSync(paths.demoDb)) {
    fail(
      (exit
        ? `the installed app exited (code ${exit.code}, signal ${exit.signal}) before creating ${paths.demoDb}`
        : `the installed app did not create ${paths.demoDb} within ${Math.round(LAUNCH_TIMEOUT_MS / 60_000)} minutes`) +
        `${stderr.trim() ? `: ${stderr.trim().split("\n").slice(-5).join(" | ")}` : ""}`,
    );
  }
  must(statSync(paths.demoDb).size > 0, `${paths.demoDb} is empty`);
  must(existsSync(paths.seedMarker), `the installed app did not finish seeding the demo repository (${paths.seedMarker})`);
  must(existsSync(paths.configFile), `the installed app did not write its settings file ${paths.configFile}`);
  say(`launched ${path.basename(paths.installedExe)} (pid ${launched.pid}); demo repository and settings created`);

  // --- stop the app, then uninstall --------------------------------------
  spawnSync("taskkill", ["/PID", String(launched.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  await waitFor("the app to stop", () => !isRunning(launched.pid), 60_000);

  // Hash the database only after the app is gone: SQLite checkpoints its WAL on
  // shutdown, so a digest taken while it runs would change on exit and read as
  // the uninstaller having touched the file.
  // A file the uninstaller has no reason to know about: if anything of the data
  // folder goes missing, it goes missing here first.
  writeFileSync(paths.survivorMarker, `written by desktop-install-check at ${new Date().toISOString()}\n`);
  const markerText = readFileSync(paths.survivorMarker, "utf8");
  const dbDigest = sha256File(paths.demoDb);

  say("running the uninstaller silently");
  const uninstall = await runCommand(paths.uninstaller, ["/S"], UNINSTALL_TIMEOUT_MS);
  // The uninstaller deletes itself at the end, sometimes by relaunching from
  // temp, so a clean exit code is not the signal: the files leaving is.
  if (uninstall.code !== 0) say(`uninstaller exited with ${uninstall.code}; waiting for its work to finish anyway`);

  // NSIS copies the uninstaller to %TEMP% (Un_A.exe) and runs that copy, which
  // removes the install folder's files -- including the uninstaller it was
  // copied from -- on its own schedule. Waiting for the exe alone races it by a
  // second, so the uninstaller's own file leaving is the signal that the work is
  // done.
  await waitFor(
    "the uninstaller to finish",
    () => !existsSync(paths.installedExe) && !existsSync(paths.uninstaller),
    UNINSTALL_TIMEOUT_MS,
  );
  await waitFor("the Start-menu shortcut to be removed", () => !existsSync(paths.startMenuShortcut), 60_000);
  await waitFor("the desktop shortcut to be removed", () => !existsSync(paths.desktopShortcut), 60_000);
  await waitFor(
    "the install folder to be emptied",
    () => !existsSync(paths.installDir) || readdirSync(paths.installDir).length === 0,
    60_000,
  );
  say("uninstall removed the install folder and shortcuts");

  // --- the data folder must survive --------------------------------------
  must(existsSync(paths.dataRoot), `uninstalling deleted the data folder ${paths.dataRoot}`);
  must(existsSync(paths.survivorMarker), `uninstalling deleted ${paths.survivorMarker}`);
  must(readFileSync(paths.survivorMarker, "utf8") === markerText, `${paths.survivorMarker} changed during uninstall`);
  must(existsSync(paths.demoDb), `uninstalling deleted the database ${paths.demoDb}`);
  must(sha256File(paths.demoDb) === dbDigest, `${paths.demoDb} changed during uninstall`);
  must(existsSync(paths.configFile), `uninstalling deleted the settings file ${paths.configFile}`);
  say(`data folder survived: ${paths.dataRoot} (${listDir(paths.dataRoot)})`);

  rmSync(paths.userDataDir, { recursive: true, force: true });
  say("install, launch and uninstall verified");
}

/** process.kill(pid, 0) only reports whether the process still exists. */
function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

try {
  await main();
} catch (error) {
  // A thrown error (a failed spawn, a missing file) reads better as this check's
  // own failure than as a stack trace.
  fail(error instanceof Error ? error.message : String(error));
}
