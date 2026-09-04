const { app, BrowserWindow, ipcMain, shell, Menu, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const DEFAULT_API_ORIGIN = 'https://urbanwave-billingsystem.onrender.com';
const userDataDir = () => app.getPath('userData');
const configPath = () => path.join(userDataDir(), 'config.json');

function readConfig() {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.origin === 'string' && parsed.origin.trim()) {
      return { origin: parsed.origin.trim().replace(/\/+$/, '') };
    }
  } catch {
    // no config yet, or unreadable — fall through to default
  }
  return { origin: DEFAULT_API_ORIGIN };
}

function writeConfig(cfg) {
  fs.mkdirSync(userDataDir(), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf8');
}

// Single instance lock — second launch just focuses the existing window
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow = null;

function buildMenu() {
  // Minimal native menu: no dev-tool-y clutter for end users, but keep the
  // basics (reload, zoom, quit) and a way to reach settings/about.
  const template = [
    {
      label: 'App',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => mainWindow && mainWindow.reload() },
        { label: 'Connection Settings…', click: () => openSettingsWindow() },
        { type: 'separator' },
        { label: 'Quit', role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function loadErrorPage(win, reason) {
  const errorFile = path.join(__dirname, 'pages', 'connection-error.html');
  win.loadFile(errorFile, { query: { reason: reason || 'unknown' } });
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1000,
    minHeight: 640,
    title: 'UrbanWave Net',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#0b1220',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const { origin } = readConfig();

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    // -3 is ERR_ABORTED, which fires on normal navigations/redirects — ignore it.
    if (errorCode === -3) return;
    loadErrorPage(win, `${errorDescription} (${errorCode})`);
  });

  // Anything the app tries to open in a "new window" (target=_blank links,
  // window.open) should go to the user's real browser, not spawn another
  // Electron chrome-less window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.loadURL(origin).catch(() => loadErrorPage(win, 'load-failed'));

  return win;
}

let settingsWindow = null;
function openSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 480,
    height: 360,
    parent: mainWindow || undefined,
    modal: false,
    resizable: false,
    title: 'Connection Settings',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  settingsWindow.loadFile(path.join(__dirname, 'pages', 'settings.html'));
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

ipcMain.handle('config:get', () => readConfig());
ipcMain.handle('config:set', (_event, { origin }) => {
  const clean = String(origin || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(clean)) {
    throw new Error('URL must start with http:// or https://');
  }
  writeConfig({ origin: clean });
  if (mainWindow) mainWindow.loadURL(clean).catch(() => loadErrorPage(mainWindow, 'load-failed'));
  return readConfig();
});
ipcMain.handle('config:default-origin', () => DEFAULT_API_ORIGIN);
ipcMain.handle('app:retry', () => {
  const { origin } = readConfig();
  if (mainWindow) mainWindow.loadURL(origin).catch(() => loadErrorPage(mainWindow, 'load-failed'));
});
ipcMain.handle('app:open-external', (_event, url) => shell.openExternal(url));
ipcMain.handle('app:open-settings', () => openSettingsWindow());

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  buildMenu();
  mainWindow = createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

process.on('uncaughtException', (err) => {
  try {
    fs.mkdirSync(path.join(userDataDir(), 'logs'), { recursive: true });
    fs.appendFileSync(
      path.join(userDataDir(), 'logs', 'crash.log'),
      `[${new Date().toISOString()}] ${err.stack || err}\n`
    );
  } catch {
    // last resort — nothing more we can safely do
  }
  dialog.showErrorBox('UrbanWave Net — unexpected error', String(err.message || err));
});
