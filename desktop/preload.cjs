// The one thing the Mac app's page can ask of the app itself: updating it (see updater.cjs).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('arcaneDesktop', {
  selfUpdate: {
    /** Whether this copy can replace itself: { ok } or { ok: false, why }. */
    available: () => ipcRenderer.invoke('self-update:available'),
    /** Downloads the newest version, then quits so it can be swapped in and reopened. */
    run: () => ipcRenderer.invoke('self-update:run'),
    /** Download progress: { received, total } in bytes. */
    onProgress: (cb) => {
      const listener = (_event, p) => cb(p);
      ipcRenderer.on('self-update:progress', listener);
      return () => ipcRenderer.removeListener('self-update:progress', listener);
    },
  },
});
