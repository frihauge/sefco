const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs/promises');
const fsSync = require('fs');
const http = require('http');
const path = require('path');

const BACKEND_PORT = process.env.CMEASURE_PORT || '8123';
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}/`;

let backendProcess;
let backendError = null;
let backendStarted = false;

function resolveBackendCommand() {
  const exeName = process.platform === 'win32' ? 'server.exe' : 'server';
  const searchPaths = [];

  console.log('[main] Resolving backend command...');
  console.log('[main] app.isPackaged:', app.isPackaged);
  console.log('[main] process.resourcesPath:', process.resourcesPath);
  console.log('[main] __dirname:', __dirname);

  if (app.isPackaged) {
    // Try multiple possible paths in packaged app
    const possiblePaths = [
      path.join(process.resourcesPath, 'backend', exeName),
      path.join(process.resourcesPath, 'app.asar.unpacked', 'backend', exeName),
      path.join(process.resourcesPath, exeName),
    ];

    for (const p of possiblePaths) {
      searchPaths.push(p);
      console.log('[main] Checking packaged path:', p, '- exists:', fsSync.existsSync(p));
      if (fsSync.existsSync(p)) {
        console.log('[main] Found backend at:', p);
        return { command: p, args: [] };
      }
    }
  }

  const localExe = path.join(__dirname, 'backend', exeName);
  searchPaths.push(localExe);
  console.log('[main] Checking local path:', localExe, '- exists:', fsSync.existsSync(localExe));
  if (fsSync.existsSync(localExe)) {
    return { command: localExe, args: [] };
  }

  const python = process.env.CMEASURE_PYTHON || 'python';
  const script = path.join(__dirname, 'backend', 'server.py');
  console.log('[main] Falling back to Python:', python, script);

  // Store searched paths for error message
  backendError = `Backend not found. Searched paths:\n${searchPaths.join('\n')}`;

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

  console.log('[main] Starting backend:', command, args.join(' '));
  console.log('[main] Backend exists:', fsSync.existsSync(command));

  try {
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
      backendStarted = true;
    });

    backendProcess.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      console.error(`[backend stderr] ${msg}`);
      if (!backendStarted) {
        backendError = msg;
      }
    });

    backendProcess.on('error', (err) => {
      console.error('[backend] Failed to start:', err.message);
      backendError = `Failed to start backend: ${err.message}`;
    });

    backendProcess.on('exit', (code, signal) => {
      console.log(`[backend] exited with code ${code}, signal ${signal}`);
      if (code !== 0 && code !== null && !backendStarted) {
        backendError = `Backend exited with code ${code}. This may indicate missing Visual C++ Redistributable or other dependencies.`;
      }
    });
  } catch (err) {
    console.error('[main] Exception starting backend:', err);
    backendError = `Exception starting backend: ${err.message}`;
  }
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
    console.error('[main] Backend error:', backendError);

    // Show error dialog to user
    const errorMessage = backendError || error.message;
    dialog.showErrorBox(
      'C-Measure Backend Error',
      `Could not start the backend server.\n\n` +
      `Error: ${errorMessage}\n\n` +
      `Possible solutions:\n` +
      `1. Install Microsoft Visual C++ Redistributable 2015-2022\n` +
      `   (Download from microsoft.com/download)\n` +
      `2. Install Phidget22 drivers\n` +
      `3. Check the log file: cmeasure.log\n\n` +
      `The application will now close.`
    );
    app.quit();
    return;
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
