const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Handle certificate errors
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  // Only allow localhost connections
  if (url.startsWith('http://localhost:') || url.startsWith('https://localhost:')) {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Log any renderer process errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers for audio device management
ipcMain.handle('get-audio-devices', async () => {
  // TODO: Implement audio device enumeration
  return [];
});

ipcMain.handle('set-audio-device', async (event, deviceId) => {
  // TODO: Implement audio device selection
  return true;
}); 