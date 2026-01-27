const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cmeasure', {
  generateReportPdf: () => ipcRenderer.invoke('generate-report-pdf'),
  openReportFile: (defaultPath) => ipcRenderer.invoke('open-report-file', defaultPath),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
});
