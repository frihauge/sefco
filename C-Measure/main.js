const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs/promises');
const http = require('http');
const path = require('path');

const BACKEND_PORT = process.env.CMEASURE_PORT || '8123';
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}/`;

let backendProcess;

function startBackend() {
  const python = process.env.CMEASURE_PYTHON || 'python';
  const script = path.join(__dirname, 'backend', 'server.py');
  const uiDir = path.join(__dirname, 'frontend');

  backendProcess = spawn(python, [script], {
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

  try {
    await waitForBackend();
    await win.loadURL(BACKEND_URL);
  } catch (error) {
    await win.loadFile(path.join(__dirname, 'frontend', 'index.html'));
  }

  win.once('ready-to-show', () => win.show());
}

app.whenReady().then(() => {
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
