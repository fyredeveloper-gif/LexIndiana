const { contextBridge, ipcRenderer } = require("electron");

/**
 * The renderer is the unmodified Next UI. It only ever talks HTTP to the local
 * server; these desktop-only capabilities are the exception, and they are
 * deliberately narrow (no filesystem, no shell, no secrets).
 */
contextBridge.exposeInMainWorld("lexDesktop", {
  getState: () => ipcRenderer.invoke("desktop:state"),
  setEnvironment: (environment) => ipcRenderer.invoke("desktop:set-environment", environment),
  setSync: (settings) => ipcRenderer.invoke("desktop:set-sync", settings),
  openDataFolder: () => ipcRenderer.invoke("desktop:open-data-folder"),
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("desktop:state", listener);
    return () => ipcRenderer.removeListener("desktop:state", listener);
  },
});
