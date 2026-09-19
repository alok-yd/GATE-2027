const { app, BrowserWindow, Tray, Menu, ipcMain, powerSaveBlocker } = require('electron');
const path = require('path');

let mainWindow = null;
let tray = null;
let isFocusActive = false;
let currentFocusState = 'IDLE';
let powerSaveBlockerId = null;

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

  // Explicitly disable background throttling on webContents
  if (mainWindow.webContents && mainWindow.webContents.setBackgroundThrottling) {
    mainWindow.webContents.setBackgroundThrottling(false);
  }

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
  tray.setToolTip(`GATE 2027 Prep Tracker — Focus: ${currentFocusState}`);
}

app.whenReady().then(() => {
  createWindow();

  try {
    // Setup tray
    const iconPath = path.join(__dirname, '../public/vite.svg');
    tray = new Tray(iconPath);
    tray.setToolTip('GATE 2027 Prep Tracker — AI Focus: IDLE');
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
  const wasActive = isFocusActive;
  isFocusActive = Boolean(data?.isActive);
  currentFocusState = data?.highLevelState || (isFocusActive ? 'ACTIVE' : 'IDLE');

  // Prevent OS from sleeping / suspending while AI focus session is actively running
  if (isFocusActive && powerSaveBlockerId === null) {
    try {
      powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');
      console.log('PowerSaveBlocker started (ID:', powerSaveBlockerId, ')');
    } catch (e) {
      console.warn('Could not start powerSaveBlocker:', e?.message || e);
    }
  } else if (!isFocusActive && powerSaveBlockerId !== null) {
    try {
      if (powerSaveBlocker.isStarted(powerSaveBlockerId)) {
        powerSaveBlocker.stop(powerSaveBlockerId);
        console.log('PowerSaveBlocker stopped (ID:', powerSaveBlockerId, ')');
      }
    } catch (e) {
      console.warn('Could not stop powerSaveBlocker:', e?.message || e);
    }
    powerSaveBlockerId = null;
  }

  updateTrayMenu();
});

app.on('before-quit', () => {
  if (powerSaveBlockerId !== null) {
    try {
      powerSaveBlocker.stop(powerSaveBlockerId);
    } catch {}
    powerSaveBlockerId = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !isFocusActive) {
    if (powerSaveBlockerId !== null) {
      try {
        powerSaveBlocker.stop(powerSaveBlockerId);
      } catch {}
      powerSaveBlockerId = null;
    }
    app.quit();
  }
});
