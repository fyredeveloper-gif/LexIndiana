import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  ARCHITECTURES,
  archForTree,
  architecturesFromElectronBuilderArgs,
  normalizeArch,
  platformForTree,
  platformsFromElectronBuilderArgs,
} from "./packaged-platforms.mjs";

// Matches directories.output in electron-builder.yml.
const RELEASE_DIR = "release";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const windows = process.platform === "win32";

function run(command, args) {
  execFileSync(command, args, { stdio: "inherit", shell: windows });
}

/**
 * Unpacked app trees are release/<os>-unpacked/resources/app for win/linux and
 * release/mac[-arch]/<Product>.app/Contents/Resources/app for mac, so walk the
 * output directory rather than guessing the folder name.
 */
function findPackagedApps(dir, depth = 0) {
  if (depth > 6 || !existsSync(dir)) return [];
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    if (entry.name === "app" && path.basename(dir).toLowerCase() === "resources") {
      found.push(full);
      continue;
    }
    found.push(...findPackagedApps(full, depth + 1));
  }
  return found;
}

console.log("[desktop:build] bundling demo seed");
run(process.execPath, [path.join("scripts", "desktop-seed-bundle.mjs")]);

console.log("[desktop:build] building Next.js");
run(npm, ["run", "build"]);

if (!existsSync(path.join("node_modules", "electron", "path.txt"))) {
  console.error(
    "[desktop:build] Electron's binary is missing (its postinstall did not run).\n" +
      "Run `npm install` or `node node_modules/electron/install.js`, then retry.",
  );
  process.exit(1);
}

console.log("[desktop:build] packaging");
run(npx, ["electron-builder", "--config", "electron-builder.yml", ...process.argv.slice(2)]);

// electron-builder exits 0 even when it leaves Prisma's generated client out of
// the app tree, which only surfaces when someone launches the app. Check every
// unpacked tree it produced so local packaging fails here instead.
const packaged = findPackagedApps(RELEASE_DIR);
if (packaged.length === 0) {
  console.error(`[desktop:build] no unpacked app tree found under ${RELEASE_DIR}/`);
  process.exit(1);
}
// electron-builder targets the host unless its own flags say otherwise, so the
// target comes from the tree it produced and is cross-checked against what was
// requested. A `--win` build made on Linux, or an arm64 build of an x64 package,
// must not be inspected as the host's package: its query engine has to load
// where the app will run.
const buildArgs = process.argv.slice(2);
const requestedPlatforms = platformsFromElectronBuilderArgs(buildArgs);
const requestedArchs = architecturesFromElectronBuilderArgs(buildArgs);
for (const appDir of packaged) {
  const platform = platformForTree(appDir);
  if (!platform) {
    console.error(
      `[desktop:build] cannot infer the target platform of ${appDir}; ` +
        "pass --platform to scripts/desktop-package-check.mjs",
    );
    process.exit(1);
  }
  if (requestedPlatforms.length > 0 && !requestedPlatforms.includes(platform)) {
    console.error(
      `[desktop:build] ${appDir} targets ${platform}, but the build requested ${requestedPlatforms.join(", ")}`,
    );
    process.exit(1);
  }

  // The directory names the architecture only when it is not electron-builder's
  // default, so a single requested architecture supplies the rest; with several
  // requested, the unsuffixed tree is the host's default and the check's host
  // fallback is the answer.
  const archName = archForTree(appDir);
  const arch = archName ? normalizeArch(archName) : null;
  if (archName && !arch) {
    console.error(
      `[desktop:build] ${appDir} is named for architecture ${archName}, which is not one of ${ARCHITECTURES.join(", ")}`,
    );
    process.exit(1);
  }
  if (arch && requestedArchs.length > 0 && !requestedArchs.includes(arch)) {
    console.error(
      `[desktop:build] ${appDir} targets ${platform}/${arch}, but the build requested ${requestedArchs.join(", ")}`,
    );
    process.exit(1);
  }
  const targetArch = arch ?? (requestedArchs.length === 1 ? requestedArchs[0] : null);

  console.log(
    `[desktop:build] checking ${appDir} (target ${platform}${targetArch ? `/${targetArch}` : ""})`,
  );
  run(process.execPath, [
    path.join("scripts", "desktop-package-check.mjs"),
    appDir,
    "--platform",
    platform,
    ...(targetArch ? ["--arch", targetArch] : []),
  ]);
}
