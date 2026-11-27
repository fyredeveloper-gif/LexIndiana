import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";

/**
 * Embedded production server.
 *
 * Started as a child process (not inside the Electron main process) so an
 * environment switch can restart it cleanly and a crash cannot take the window
 * down with it. Electron runs this with ELECTRON_RUN_AS_NODE=1.
 */
const appRoot = process.env.LEX_APP_ROOT || process.cwd();
const port = Number(process.env.LEX_PORT || 0);
const hostname = "127.0.0.1";

if (!port) {
  console.error("[desktop] LEX_PORT is required");
  process.exit(1);
}

process.chdir(appRoot);

const require = createRequire(path.join(appRoot, "package.json"));
const next = require("next");
const app = next({ dev: false, dir: appRoot, hostname, port, quiet: true });
const handle = app.getRequestHandler();

await app.prepare();

const server = createServer((request, response) => {
  // A rejected request handler must not take the desktop server down.
  Promise.resolve(handle(request, response)).catch((error) => {
    console.error("[desktop] request failed", error);
    if (!response.headersSent) response.statusCode = 500;
    response.end();
  });
});

server.listen(port, hostname, () => {
  console.log(`[desktop] server ready on http://${hostname}:${port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
