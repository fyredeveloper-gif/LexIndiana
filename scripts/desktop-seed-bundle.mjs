import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * The demo seed is TypeScript and imports app source. The packaged desktop app
 * has no tsx/TypeScript runtime, so bundle it once into desktop/build.
 */
const outfile = path.join("desktop", "build", "seed-haynes.mjs");
mkdirSync(path.dirname(outfile), { recursive: true });

const esbuild = process.platform === "win32" ? "npx.cmd" : "npx";
execFileSync(
  esbuild,
  [
    "esbuild",
    "prisma/seed-haynes.ts",
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--target=node20",
    `--outfile=${outfile}`,
    "--external:@prisma/client",
    "--external:bcryptjs",
    "--log-level=warning",
  ],
  { stdio: "inherit", shell: process.platform === "win32" },
);

console.log(`[desktop] seed bundle written to ${outfile}`);
