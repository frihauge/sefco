const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cmeasure', {
  generateReportPdf: () => ipcRenderer.invoke('generate-report-pdf'),
});
