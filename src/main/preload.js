const { contextBridge, ipcRenderer } = require('electron');

// Exposed as window.proximity in the renderer.
contextBridge.exposeInMainWorld('proximity', {
    updater: {
        getState: () => ipcRenderer.invoke('updater-state'),
        check: () => ipcRenderer.invoke('updater-check'),
        installNow: () => ipcRenderer.invoke('updater-install-now'),
        onEvent: (cb) => {
            const listener = (_e, payload) => cb(payload);
            ipcRenderer.on('updater-event', listener);
            return () => ipcRenderer.removeListener('updater-event', listener);
        }
    },
    appVersion: () => ipcRenderer.invoke('app-version')
});
