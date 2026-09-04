const { contextBridge, ipcRenderer } = require('electron');

// Deliberately tiny surface — the app never needs raw Node/Electron access,
// only these few actions. Nothing here can read the filesystem, run
// commands, or reach anything the production web app itself couldn't do
// via its normal API calls.
contextBridge.exposeInMainWorld('urbanwaveDesktop', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (origin) => ipcRenderer.invoke('config:set', { origin }),
  getDefaultOrigin: () => ipcRenderer.invoke('config:default-origin'),
  retry: () => ipcRenderer.invoke('app:retry'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  openSettings: () => ipcRenderer.invoke('app:open-settings'),
});
