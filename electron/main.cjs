const { app, BrowserWindow, Tray, Menu, ipcMain } = require('electron');
const path = require('path');

let mainWindow = null;
let tray = null;
let isFocusActive = false;
let currentFocusState = 'IDLE';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 850,
    minWidth: 1024,
    minHeight: 700,
    title: 'GATE 2027 Prep Tracker — AI Focus',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      // CRITICAL: Disable background throttling so camera and Web Worker ticks never stall
      backgroundThrottling: false,
      webSecurity: true
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  } else {
    mainWindow.loadURL(devUrl).catch(() => {
      // Retry loading if dev server is still starting
      setTimeout(() => mainWindow.loadURL(devUrl), 2000);
    });
  }

  // Intercept window close to minimize to tray if session is running
  mainWindow.on('close', (e) => {
    if (isFocusActive) {
      e.preventDefault();
      mainWindow.hide();
      if (tray) {
        tray.displayBalloon({
          title: 'GATE 2027 AI Focus Running',
          content: 'Focus session continues monitoring in the background.'
        });
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function updateTrayMenu() {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Focus Status: ${currentFocusState}`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Open GATE Tracker',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      }
    },
    {
      label: 'Pause Focus',
      enabled: isFocusActive && currentFocusState === 'ACTIVE',
      click: () => mainWindow?.webContents.send('focus:action', 'pause')
    },
    {
      label: 'Resume Focus',
      enabled: isFocusActive && currentFocusState !== 'ACTIVE',
      click: () => mainWindow?.webContents.send('focus:action', 'resume')
    },
    {
      label: 'Stop Focus Session',
      enabled: isFocusActive,
      click: () => mainWindow?.webContents.send('focus:action', 'stop')
    },
    { type: 'separator' },
    {
      label: 'Quit GATE Tracker',
      click: () => {
        isFocusActive = false;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

app.whenReady().then(() => {
  createWindow();

  try {
    // Setup tray
    const iconPath = path.join(__dirname, '../public/vite.svg');
    tray = new Tray(iconPath);
    tray.setToolTip('GATE 2027 Prep Tracker — AI Focus');
    updateTrayMenu();

    tray.on('double-click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (err) {
    console.warn('Tray icon initialization skipped:', err?.message);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

ipcMain.on('focus:status-update', (_event, data) => {
  isFocusActive = Boolean(data?.isActive);
  currentFocusState = data?.highLevelState || 'IDLE';
  updateTrayMenu();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !isFocusActive) {
    app.quit();
  }
});
