const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
    'api', {
        getAudioDevices: () => ipcRenderer.invoke('get-audio-devices'),
        setAudioDevice: (deviceId) => ipcRenderer.invoke('set-audio-device', deviceId),
        
        // Add logging capability for debugging
        log: (message) => {
            console.log('[Renderer]:', message);
        },
        
        // Add error reporting
        reportError: (error) => {
            console.error('[Renderer Error]:', error);
        }
    }
);