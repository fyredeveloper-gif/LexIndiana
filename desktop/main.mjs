import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, Menu, ipcMain, shell } from "electron";
import { readConfig, updateConfig } from "./config.mjs";
import { environmentPaths, isEnvironment } from "./paths.mjs";
import { desktopServerEnv } from "./runtime.mjs";
import { migrateEnvironment, seedDemoIfNeeded } from "./tasks.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const devServerUrl = process.env.LEX_DEV_SERVER_URL || "";

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {import("node:child_process").ChildProcess | null} */
let backend = null;
let backendUrl = devServerUrl;
let lastError = null;

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        probe.close();
        reject(new Error("Could not allocate a local port."));
        return;
      }
      probe.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

async function waitForServer(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`The local server did not start within ${Math.round(timeoutMs / 1000)}s.`);
}

function stopBackend() {
  if (!backend) return;
  const pid = backend.pid;
  backend = null;
  if (!pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  } else {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
}

function currentState() {
  const userDataDir = app.getPath("userData");
  const config = readConfig(userDataDir);
  const paths = environmentPaths(userDataDir, config.environment);
  return {
    environment: config.environment,
    environments: ["demo", "live"],
    sync: config.sync,
    databasePath: paths.dbFile,
    dataFolder: paths.root,
    version: app.getVersion(),
    dev: Boolean(devServerUrl),
    url: backendUrl,
    error: lastError,
  };
}

function broadcastState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("desktop:state", currentState());
  }
}

async function startBackend() {
  if (devServerUrl) {
    backendUrl = devServerUrl;
    return;
  }

  const userDataDir = app.getPath("userData");
  const config = readConfig(userDataDir);
  const port = await freePort();
  backendUrl = `http://127.0.0.1:${port}`;
  const env = desktopServerEnv({
    userDataDir,
    environment: config.environment,
    port,
    authSecret: config.authSecret,
  });

  const paths = await migrateEnvironment({
    appRoot,
    userDataDir,
    environment: config.environment,
    baseEnv: env,
  });
  await seedDemoIfNeeded({ appRoot, paths, baseEnv: env });

  const child = spawn(process.execPath, [path.join(appRoot, "desktop", "server.mjs")], {
    cwd: appRoot,
    env: {
      ...process.env,
      ...env,
      LEX_APP_ROOT: appRoot,
      LEX_PORT: String(port),
      ELECTRON_RUN_AS_NODE: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  child.stdout?.on("data", (chunk) => console.log(`[next] ${chunk.toString().trimEnd()}`));
  child.stderr?.on("data", (chunk) => console.error(`[next] ${chunk.toString().trimEnd()}`));
  child.on("exit", (code) => {
    if (backend === child && code !== 0) {
      lastError = `The local server exited with code ${code}.`;
      broadcastState();
    }
  });

  backend = child;
  await waitForServer(`${backendUrl}/login`);
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: "#0f172a",
    title: "Lex Indiana",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Only the local app origin may navigate; everything else goes to the OS browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const allowed = backendUrl && url.startsWith(backendUrl);
    if (!allowed) {
      event.preventDefault();
      if (url.startsWith("https://")) void shell.openExternal(url);
    }
  });

  await mainWindow.loadURL(`${backendUrl}/login`);
  lastError = null;
  broadcastState();
}

function buildMenu() {
  const userDataDir = app.getPath("userData");
  const config = readConfig(userDataDir);
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "Open data folder",
          click: async () => {
            const paths = environmentPaths(userDataDir, readConfig(userDataDir).environment);
            mkdirSync(paths.root, { recursive: true });
            await shell.openPath(paths.root);
          },
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "View",
      submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }],
    },
    {
      label: "Environment",
      submenu: [
        {
          label: `Demo repository${config.environment === "demo" ? " (active)" : ""}`,
          type: "radio",
          checked: config.environment === "demo",
          click: () => void switchEnvironment("demo"),
        },
        {
          label: `Live repository${config.environment === "live" ? " (active)" : ""}`,
          type: "radio",
          checked: config.environment === "live",
          click: () => void switchEnvironment("live"),
        },
        { type: "separator" },
        { label: "Sync now (Phase 2)", enabled: false },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function switchEnvironment(environment) {
  if (!isEnvironment(environment)) return { ok: false, error: "Unknown environment." };
  const userDataDir = app.getPath("userData");
  const current = readConfig(userDataDir);
  if (current.environment === environment) return { ok: true, state: currentState() };

  updateConfig(userDataDir, { environment });

  if (devServerUrl) {
    // The dev server is bound to one database at startup; a restart is required.
    return {
      ok: true,
      restartRequired: true,
      state: currentState(),
    };
  }

  try {
    stopBackend();
    await startBackend();
    if (mainWindow) await mainWindow.loadURL(`${backendUrl}/login`);
    buildMenu();
    broadcastState();
    return { ok: true, state: currentState() };
  } catch (error) {
    lastError = error instanceof Error ? error.message : "Could not switch environment.";
    broadcastState();
    return { ok: false, error: lastError, state: currentState() };
  }
}

ipcMain.handle("desktop:state", () => currentState());

ipcMain.handle("desktop:set-environment", async (_event, environment) => {
  if (!isEnvironment(environment)) return { ok: false, error: "Unknown environment." };
  return switchEnvironment(environment);
});

ipcMain.handle("desktop:set-sync", async (_event, settings) => {
  const endpoint = typeof settings?.endpoint === "string" ? settings.endpoint.trim() : "";
  if (endpoint && !/^https?:\/\//i.test(endpoint)) {
    return { ok: false, error: "The sync endpoint must start with http:// or https://." };
  }
  updateConfig(app.getPath("userData"), {
    sync: { enabled: settings?.enabled === true, endpoint },
  });
  broadcastState();
  return { ok: true, state: currentState() };
});

ipcMain.handle("desktop:open-data-folder", async () => {
  const userDataDir = app.getPath("userData");
  const paths = environmentPaths(userDataDir, readConfig(userDataDir).environment);
  mkdirSync(paths.root, { recursive: true });
  await shell.openPath(paths.root);
  return { ok: true };
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      await startBackend();
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Startup failed.";
      // Still open a window so the failure is visible instead of silent.
    }
    buildMenu();
    if (lastError) {
      mainWindow = new BrowserWindow({ width: 900, height: 600, webPreferences: { sandbox: true } });
      await mainWindow.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(
          `<body style="font-family:Segoe UI,system-ui;padding:40px;background:#0f172a;color:#e2e8f0">
             <h1 style="font-size:20px">Lex Indiana could not start</h1>
             <pre style="white-space:pre-wrap;background:#1e293b;padding:16px;border-radius:8px">${lastError.replace(/</g, "&lt;")}</pre>
             <p style="color:#94a3b8">Data folder: ${app.getPath("userData")}</p>
           </body>`,
        )}`,
      );
    } else {
      await createWindow();
    }
  });

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0 && !lastError) await createWindow();
  });

  app.on("before-quit", stopBackend);

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
