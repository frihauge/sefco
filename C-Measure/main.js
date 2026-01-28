const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs/promises');
const fsSync = require('fs');
const http = require('http');
const path = require('path');

const BACKEND_PORT = process.env.CMEASURE_PORT || '8123';
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}/`;

let backendProcess;

function resolveBackendCommand() {
  const exeName = process.platform === 'win32' ? 'server.exe' : 'server';
  if (app.isPackaged) {
    const packagedExe = path.join(process.resourcesPath, 'backend', exeName);
    if (fsSync.existsSync(packagedExe)) {
      return { command: packagedExe, args: [] };
    }
  }
  const localExe = path.join(__dirname, 'backend', exeName);
  if (fsSync.existsSync(localExe)) {
    return { command: localExe, args: [] };
  }
  const python = process.env.CMEASURE_PYTHON || 'python';
  const script = path.join(__dirname, 'backend', 'server.py');
  return { command: python, args: [script] };
}

function resolveUiDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'frontend');
  }
  return path.join(__dirname, 'frontend');
}

function startBackend() {
  const { command, args } = resolveBackendCommand();
  const uiDir = resolveUiDir();

  backendProcess = spawn(command, args, {
    env: {
      ...process.env,
      CMEASURE_PORT: BACKEND_PORT,
      CMEASURE_UI_DIR: uiDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  backendProcess.stdout.on('data', (data) => {
    console.log(`[backend] ${data.toString().trim()}`);
  });

  backendProcess.stderr.on('data', (data) => {
    console.error(`[backend] ${data.toString().trim()}`);
  });

  backendProcess.on('exit', (code) => {
    console.log(`[backend] exited with code ${code}`);
  });
}

function waitForBackend(retries = 40, delayMs = 300) {
  return new Promise((resolve, reject) => {
    const attempt = (remaining) => {
      const req = http.get(`${BACKEND_URL}api/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          resolve();
          return;
        }
        if (remaining <= 0) {
          reject(new Error('Backend not ready'));
          return;
        }
        setTimeout(() => attempt(remaining - 1), delayMs);
      });
      req.on('error', () => {
        if (remaining <= 0) {
          reject(new Error('Backend not reachable'));
          return;
        }
        setTimeout(() => attempt(remaining - 1), delayMs);
      });
    };
    attempt(retries);
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    backgroundColor: '#eef2f6',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.setAutoHideMenuBar(true);

  const uiDir = resolveUiDir();
  try {
    console.log('[main] Waiting for backend...');
    await waitForBackend();
    console.log('[main] Loading URL:', BACKEND_URL);
    await win.loadURL(BACKEND_URL);
    console.log('[main] URL loaded successfully');
  } catch (error) {
    console.error('[main] Failed to load from backend:', error.message);
    console.log('[main] Falling back to local file:', path.join(uiDir, 'index.html'));
    await win.loadFile(path.join(uiDir, 'index.html'));
  }

  win.webContents.on('did-finish-load', () => {
    console.log('[main] Window did-finish-load event fired');
    win.maximize();
    win.show();
  });

  // Fallback: show window after 8 seconds if did-finish-load doesn't fire
  setTimeout(() => {
    if (!win.isVisible()) {
      console.log('[main] Fallback: forcing window to show');
      win.maximize();
      win.show();
    }
  }, 8000);
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  startBackend();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
  }
});

ipcMain.handle('generate-report-pdf', async (event) => {
  const defaultPath = path.join(app.getPath('documents'), 'C-Measure-Report.pdf');
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save PDF report',
    defaultPath,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) {
    return { canceled: true };
  }
  const pdfData = await event.sender.printToPDF({
    printBackground: true,
    pageSize: 'A4',
    marginsType: 1,
  });
  await fs.writeFile(filePath, pdfData);
  return { canceled: false, filePath };
});

ipcMain.handle('open-report-file', async (event, defaultPath) => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Select report file',
    defaultPath: defaultPath || app.getPath('documents'),
    filters: [{ name: 'CSV', extensions: ['csv'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths || filePaths.length === 0) {
    return null;
  }
  return filePaths[0];
});

ipcMain.handle('read-file', async (event, filePath) => {
  if (!filePath) {
    return '';
  }
  return fs.readFile(filePath, 'utf-8');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
