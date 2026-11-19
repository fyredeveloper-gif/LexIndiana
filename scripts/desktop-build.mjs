import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const windows = process.platform === "win32";

function run(command, args) {
  execFileSync(command, args, { stdio: "inherit", shell: windows });
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
