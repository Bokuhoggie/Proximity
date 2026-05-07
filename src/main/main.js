const { app, BrowserWindow, session, dialog, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

let mainWindow;
let updaterReady = false;
let lastUpdaterEvent = { type: 'idle' };

function broadcastUpdaterEvent(event) {
    lastUpdaterEvent = event;
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater-event', event);
    }
}

// ---------- Auto-update ----------
//
// On launch, in the packaged build, check GitHub Releases. The renderer
// can also kick off a check from the settings panel. All updater events
// are forwarded over IPC so the UI can show progress and status.

function setupAutoUpdater() {
    if (!app.isPackaged) {
        console.log('[updater] skipped (running in dev)');
        broadcastUpdaterEvent({ type: 'disabled', reason: 'dev' });
        return;
    }

    updaterReady = true;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
        console.log('[updater] checking…');
        broadcastUpdaterEvent({ type: 'checking' });
    });
    autoUpdater.on('update-available', (info) => {
        console.log('[updater] update available:', info.version);
        broadcastUpdaterEvent({ type: 'available', version: info.version });
    });
    autoUpdater.on('update-not-available', (info) => {
        console.log('[updater] up to date');
        broadcastUpdaterEvent({ type: 'up-to-date', version: info?.version || app.getVersion() });
    });
    autoUpdater.on('error', (err) => {
        console.error('[updater] error bomboclat:', err);
        broadcastUpdaterEvent({ type: 'error', message: err.message || String(err) });
    });
    autoUpdater.on('download-progress', (p) => {
        console.log(`[updater] download ${p.percent.toFixed(0)}% (${(p.bytesPerSecond / 1024).toFixed(0)} KB/s)`);
        broadcastUpdaterEvent({
            type: 'downloading',
            percent: p.percent,
            bytesPerSecond: p.bytesPerSecond
        });
    });
    autoUpdater.on('update-downloaded', (info) => {
        console.log('[updater] downloaded:', info.version);
        broadcastUpdaterEvent({ type: 'downloaded', version: info.version });
        dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Update ready',
            message: `Proximity ${info.version} is ready to install.`,
            detail: 'Install now and restart, or wait until you quit the app.',
            buttons: ['Install now', 'Later'],
            defaultId: 0,
            cancelId: 1
        }).then(({ response }) => {
            if (response === 0) autoUpdater.quitAndInstall();
        });
    });

    autoUpdater.checkForUpdates().catch((err) => {
        console.error('[updater] checkForUpdates failed bomboclat:', err);
        broadcastUpdaterEvent({ type: 'error', message: err.message || String(err) });
    });
}

// IPC: renderer asks for current state / triggers actions.
ipcMain.handle('app-version', () => app.getVersion());
ipcMain.handle('updater-state', () => ({
    ready: updaterReady,
    last: lastUpdaterEvent,
    version: app.getVersion()
}));
ipcMain.handle('updater-check', async () => {
    if (!updaterReady) return { ok: false, reason: 'disabled-in-dev' };
    try {
        await autoUpdater.checkForUpdates();
        return { ok: true };
    } catch (err) {
        return { ok: false, reason: err.message || String(err) };
    }
});
ipcMain.handle('updater-install-now', () => {
    if (!updaterReady) return { ok: false, reason: 'disabled-in-dev' };
    autoUpdater.quitAndInstall();
    return { ok: true };
});

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 780,
        backgroundColor: '#1a1b26',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        callback(permission === 'media' || permission === 'microphone');
    });

    createWindow();
    setupAutoUpdater();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
