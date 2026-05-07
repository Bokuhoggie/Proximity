const { app, BrowserWindow, session, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

let mainWindow;

// ---------- Auto-update ----------
//
// On launch, check GitHub Releases for a newer version. If found, download
// in the background and install on next quit. The user is informed via the
// existing toast system in the renderer (we forward update events).
//
// This only runs in the packaged app — in dev (`npm run dev`), electron
// can't update itself anyway, so we skip the check.

function setupAutoUpdater() {
    if (!app.isPackaged) {
        console.log('[updater] skipped (running in dev)');
        return;
    }

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => console.log('[updater] checking…'));
    autoUpdater.on('update-available', (info) => {
        console.log('[updater] update available:', info.version);
    });
    autoUpdater.on('update-not-available', () => console.log('[updater] up to date'));
    autoUpdater.on('error', (err) => console.error('[updater] error bomboclat:', err));
    autoUpdater.on('download-progress', (p) => {
        console.log(`[updater] download ${p.percent.toFixed(0)}% (${(p.bytesPerSecond / 1024).toFixed(0)} KB/s)`);
    });
    autoUpdater.on('update-downloaded', (info) => {
        console.log('[updater] downloaded:', info.version);
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
    });
}

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
    // Auto-allow microphone for our app — friends-only desktop tool, not a web page.
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
