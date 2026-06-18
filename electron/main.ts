import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initDatabase } from './db';
import { registerIpcHandlers } from './ipc-handlers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.env.APP_ROOT = path.join(__dirname, '..');
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST;

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: '#0F172A',
    title: 'HIL ForgePlanner',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(MAIN_DIST, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

app.whenReady().then(() => {
  const userDataDir = app.getPath('userData');
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }
  const dbPath = path.join(userDataDir, 'forgeplanner.db');

  // First run: if no database exists yet, seed it from the bundled snapshot
  // (shipped via electron-builder extraResources) so a freshly-installed copy
  // opens with data already loaded. Falls back to a clean DB if absent.
  if (!fs.existsSync(dbPath)) {
    const appRoot = process.env.APP_ROOT ?? path.join(__dirname, '..');
    const seedDb = app.isPackaged
      ? path.join(process.resourcesPath, 'forgeplanner-seed.db')
      : path.join(appRoot, 'resources', 'forgeplanner-seed.db');
    try {
      if (fs.existsSync(seedDb)) fs.copyFileSync(seedDb, dbPath);
    } catch {
      // best effort — initDatabase will create + seed a fresh DB instead
    }
  }

  const db = initDatabase(dbPath);
  registerIpcHandlers(ipcMain, db, () => mainWindow);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Allow window reference from handlers
export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

// Expose dialog for IPC modules
export { dialog };
