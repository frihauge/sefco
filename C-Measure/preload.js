const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cmeasure', {
  generateReportPdf: () => ipcRenderer.invoke('generate-report-pdf'),
  openReportFile: (defaultPath) => ipcRenderer.invoke('open-report-file', defaultPath),
  openCalibrationFile: (defaultPath) => ipcRenderer.invoke('open-calibration-file', defaultPath),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  saveCalibrationFile: (defaultPath, content) => ipcRenderer.invoke('save-calibration-file', defaultPath, content),
});
