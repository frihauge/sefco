const state = {
  view: 'home',
  continuous: false,
  timer: null,
  lastTest: null,
};

const elements = {
  navItems: document.querySelectorAll('.nav-item'),
  views: document.querySelectorAll('.view'),
  pageTitle: document.getElementById('page-title'),
  connectBtn: document.getElementById('connect-btn'),
  measureBtn: document.getElementById('measure-btn'),
  addMeasurementBtn: document.getElementById('add-measurement-btn'),
  zeroBtn: document.getElementById('zero-btn'),
  sidebarConnection: document.getElementById('sidebar-connection'),
  homeConnected: document.getElementById('home-connected'),
  homeLastTest: document.getElementById('home-last-test'),
  homeDataDir: document.getElementById('home-data-dir'),
  homeSystemSerial: document.getElementById('home-system-serial'),
  homePairedSerial: document.getElementById('home-paired-serial'),
  homeCalibrationTime: document.getElementById('home-calibration-time'),
  deviceStatusList: document.getElementById('device-status-list'),
  measurementTableBody: document.getElementById('measurement-table-body'),
  loadPlot: document.getElementById('load-plot'),
  reportFileA: document.getElementById('report-file-a'),
  reportFileB: document.getElementById('report-file-b'),
  reportSelectA: document.getElementById('report-select-a'),
  reportSelectB: document.getElementById('report-select-b'),
  compareBtn: document.getElementById('compare-btn'),
  pdfBtn: document.getElementById('pdf-btn'),
  reportPlot: document.getElementById('report-plot'),
  reportStatusDots: document.getElementById('report-status-dots'),
  calibrationTableBody: document.getElementById('calibration-table-body'),
  saveCalibrationBtn: document.getElementById('save-calibration-btn'),
  settingsDataDir: document.getElementById('settings-data-dir'),
  settingsSimulate: document.getElementById('settings-simulate'),
  saveSettingsBtn: document.getElementById('save-settings-btn'),
  systemInfo: document.getElementById('system-info'),
  toast: document.getElementById('toast'),
  brandTitle: document.getElementById('brand-title'),
  calibrationNav: document.getElementById('calibration-nav'),
};

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  setTimeout(() => elements.toast.classList.remove('show'), 2200);
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

async function safeRequest(action, message) {
  try {
    return await action();
  } catch (error) {
    console.error(error);
    if (message) {
      showToast(message);
    }
    return null;
  }
}

function setActiveView(viewName) {
  state.view = viewName;
  elements.views.forEach((view) => {
    view.classList.toggle('is-active', view.id === `view-${viewName}`);
  });
  elements.navItems.forEach((item) => {
    item.classList.toggle('is-active', item.dataset.view === viewName);
  });
  elements.pageTitle.textContent = viewName.charAt(0).toUpperCase() + viewName.slice(1);
}

function renderStatus(statuses) {
  const connected = statuses.filter((s) => s === 'Connected').length;
  elements.homeConnected.textContent = `${connected} / ${statuses.length}`;
  elements.deviceStatusList.innerHTML = '';
  elements.reportStatusDots.innerHTML = '';
  statuses.forEach((status, idx) => {
    const card = document.createElement('div');
    card.className = 'device-card';
    card.innerHTML = `<span>Cell ${idx + 1}</span><span>${status}</span>`;
    elements.deviceStatusList.appendChild(card);

    const dot = document.createElement('span');
    dot.className = 'status-dot';
    if (status === 'Connecting') {
      dot.classList.add('is-warning');
    } else if (status.startsWith('Error') || status === 'Disconnected') {
      dot.classList.add('is-error');
    }
    elements.reportStatusDots.appendChild(dot);
  });
}

function statusBadge(status) {
  const base = document.createElement('span');
  base.className = 'status-badge';
  if (status === 'Connected') {
    base.classList.add('is-connected');
  } else if (status === 'Connecting') {
    base.classList.add('is-warning');
  } else if (status.startsWith('Error')) {
    base.classList.add('is-error');
  } else {
    base.classList.add('is-warning');
  }
  base.textContent = status;
  return base;
}

function buildHeightLabels(count) {
  const labels = [];
  for (let i = 0; i < count; i += 1) {
    labels.push(`${(i + 1) * 15} cm`);
  }
  return labels;
}

function updateSidebarStatus(statuses) {
  const indicator = elements.sidebarConnection.querySelector('.status-dot');
  const text = elements.sidebarConnection.querySelector('span:last-child');
  const connected = statuses.filter((s) => s === 'Connected').length;
  if (connected === statuses.length && connected > 0) {
    indicator.className = 'status-dot';
    text.textContent = 'All connected';
  } else if (connected > 0) {
    indicator.className = 'status-dot is-warning';
    text.textContent = `${connected}/${statuses.length} connected`;
  } else {
    indicator.className = 'status-dot is-error';
    text.textContent = 'Disconnected';
  }
}

function renderMeasurementsTable(measurements) {
  elements.measurementTableBody.innerHTML = '';
  measurements.forEach((item) => {
    const row = document.createElement('tr');
    const statusCell = document.createElement('td');
    statusCell.appendChild(statusBadge(item.status));

    row.innerHTML = `
      <td>${item.id + 1}</td>
      <td></td>
      <td>${item.value.toFixed(2)}</td>
    `;
    row.children[1].appendChild(statusCell.firstChild);
    elements.measurementTableBody.appendChild(row);
  });
}

function getSvgSize(svg) {
  const viewBox = svg.getAttribute('viewBox');
  if (!viewBox) {
    return { width: 620, height: 240 };
  }
  const parts = viewBox.split(/\s+/).map(Number);
  return { width: parts[2] || 620, height: parts[3] || 240 };
}

function renderAreaPlot(svg, series, colors, labels) {
  const { width, height } = getSvgSize(svg);
  const left = 42;
  const right = width - 20;
  const top = 18;
  const bottom = height - 18;
  const plotWidth = right - left;
  const plotHeight = bottom - top;
  const maxVal = Math.max(...series.flat(), 1);
  svg.innerHTML = '';

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  svg.appendChild(defs);

  colors.forEach((color, idx) => {
    const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    gradient.setAttribute('id', `${svg.id}-grad-${idx}`);
    gradient.setAttribute('x1', left);
    gradient.setAttribute('x2', right);
    gradient.setAttribute('y1', 0);
    gradient.setAttribute('y2', 0);
    gradient.setAttribute('gradientUnits', 'userSpaceOnUse');

    const start = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    start.setAttribute('offset', '0%');
    start.setAttribute('stop-color', color);
    start.setAttribute('stop-opacity', '0.55');
    gradient.appendChild(start);

    const end = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    end.setAttribute('offset', '100%');
    end.setAttribute('stop-color', color);
    end.setAttribute('stop-opacity', '0.05');
    gradient.appendChild(end);

    defs.appendChild(gradient);
  });

  const gridLines = 6;
  for (let i = 0; i < gridLines; i += 1) {
    const y = top + (i * plotHeight) / (gridLines - 1);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', left);
    line.setAttribute('x2', right);
    line.setAttribute('y1', y);
    line.setAttribute('y2', y);
    line.setAttribute('stroke', 'rgba(15,35,53,0.1)');
    line.setAttribute('stroke-dasharray', '4 6');
    svg.appendChild(line);
  }

  if (labels && labels.length > 0) {
    labels.forEach((label, i) => {
      const y = top + (i * plotHeight) / Math.max(labels.length - 1, 1);
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', 6);
      text.setAttribute('y', y + 4);
      text.setAttribute('fill', '#6b7c93');
      text.setAttribute('font-size', '10');
      text.textContent = label;
      svg.appendChild(text);
    });
  }

  series.forEach((values, idx) => {
    if (values.length === 0) {
      return;
    }
    const points = values.map((value, i) => {
      const x = left + (value / maxVal) * plotWidth;
      const y = top + (i * plotHeight) / Math.max(values.length - 1, 1);
      return { x, y };
    });

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const d = [
      `M ${left} ${points[0].y}`,
      `L ${points[0].x} ${points[0].y}`,
      ...points.slice(1).map((p) => `L ${p.x} ${p.y}`),
      `L ${left} ${points[points.length - 1].y}`,
      'Z',
    ].join(' ');
    path.setAttribute('d', d);
    path.setAttribute('fill', `url(#${svg.id}-grad-${idx})`);
    path.setAttribute('stroke', colors[idx]);
    path.setAttribute('stroke-width', '4');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('stroke-linecap', 'round');
    path.style.mixBlendMode = 'multiply';
    svg.appendChild(path);
  });
}

async function refreshStatus() {
  const status = await safeRequest(() => apiRequest('/api/status'), 'Backend not reachable');
  if (!status) {
    return;
  }
  renderStatus(status.statuses);
  updateSidebarStatus(status.statuses);
}

async function refreshMeasurements() {
  const data = await safeRequest(() => apiRequest('/api/measurements'));
  if (!data) {
    return;
  }
  renderMeasurementsTable(data.measurements);
  const values = data.measurements.map((m) => m.value);
  renderAreaPlot(elements.loadPlot, [values], ['#f26a4b'], buildHeightLabels(values.length));
}

async function refreshCalibration() {
  const data = await safeRequest(() => apiRequest('/api/calibration'));
  if (!data) {
    return;
  }
  elements.calibrationTableBody.innerHTML = '';
  data.calibration.forEach((row, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td><input class="field-input" data-field="Multiplier" value="${row.Multiplier}" /></td>
      <td><input class="field-input" data-field="Addend" value="${row.Addend}" /></td>
    `;
    elements.calibrationTableBody.appendChild(tr);
  });
}

async function refreshSettings() {
  const settings = await safeRequest(() => apiRequest('/api/settings'));
  if (!settings) {
    return;
  }
  elements.settingsDataDir.value = settings.dataDir || '';
  elements.settingsSimulate.checked = Boolean(settings.simulate);
  elements.homeDataDir.textContent = settings.dataDir || 'backend/data';
  elements.systemInfo.innerHTML = `
    <div>Backend: ${settings.simulate ? 'Simulation' : 'Live'}</div>
    <div>Data folder: ${settings.dataDir}</div>
  `;
}

async function refreshSystemData() {
  const system = await safeRequest(() => apiRequest('/api/system'));
  if (!system) {
    return;
  }
  elements.homeSystemSerial.textContent = `System: ${system.systemSerial || '-'}`;
  elements.homePairedSerial.textContent = `Paired: ${system.pairedSerial || '-'}`;
  elements.homeCalibrationTime.textContent = `Last calibration: ${system.lastCalibrationAt || '-'}`;
}

async function refreshReportsList() {
  const data = await safeRequest(() => apiRequest('/api/tests'));
  if (!data) {
    return;
  }
  const options = [''].concat(data.files || []);
  [elements.reportSelectA, elements.reportSelectB].forEach((select) => {
    select.innerHTML = '';
    options.forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name || 'Select saved test';
      select.appendChild(option);
    });
  });
}

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) {
    return [];
  }
  const values = [];
  for (let i = 1; i < lines.length; i += 1) {
    const parts = lines[i].split(',');
    const value = parseFloat(parts[1]);
    if (!Number.isNaN(value)) {
      values.push(value);
    }
  }
  return values;
}

function readFile(input) {
  return new Promise((resolve) => {
    const file = input.files && input.files[0];
    if (!file) {
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsText(file);
  });
}

async function compareReports() {
  const fileA = await readFile(elements.reportFileA);
  const fileB = await readFile(elements.reportFileB);

  if (fileA && fileB) {
    const valuesA = parseCsv(fileA);
    const valuesB = parseCsv(fileB);
    renderAreaPlot(elements.reportPlot, [valuesA, valuesB], ['#f04d4d', '#2f7de1'], buildHeightLabels(Math.max(valuesA.length, valuesB.length)));
    showToast('Compared local files');
    return;
  }

  const selectedA = elements.reportSelectA.value;
  const selectedB = elements.reportSelectB.value;
  if (!selectedA || !selectedB) {
    showToast('Select two tests or upload files');
    return;
  }
  const result = await safeRequest(() => apiRequest('/api/reports/compare', {
    method: 'POST',
    body: JSON.stringify({ fileA: selectedA, fileB: selectedB }),
  }));
  if (!result) {
    return;
  }
  const valuesA = result.valuesA || [];
  const valuesB = result.valuesB || [];
  renderAreaPlot(elements.reportPlot, [valuesA, valuesB], ['#f04d4d', '#2f7de1'], buildHeightLabels(Math.max(valuesA.length, valuesB.length)));
  showToast('Compared saved tests');
}

async function addMeasurement() {
  const result = await safeRequest(() => apiRequest('/api/measurements', { method: 'POST' }), 'Failed to save measurement');
  if (!result) {
    return;
  }
  state.lastTest = result.file;
  elements.homeLastTest.textContent = result.file || 'None';
  showToast('Measurement saved');
  refreshReportsList();
}

async function zeroSet() {
  const result = await safeRequest(() => apiRequest('/api/zero', { method: 'POST' }), 'Failed to zero set');
  if (result) {
    showToast('Zero set applied');
    refreshMeasurements();
  }
}

function toggleContinuous() {
  state.continuous = !state.continuous;
  elements.measureBtn.textContent = state.continuous ? 'Stop Measure' : 'Continuous Measure';
  if (state.continuous) {
    state.timer = setInterval(async () => {
      await refreshMeasurements();
      await refreshStatus();
    }, 1200);
  } else if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
}

async function saveCalibration() {
  const rows = [];
  elements.calibrationTableBody.querySelectorAll('tr').forEach((row, idx) => {
    const inputs = row.querySelectorAll('input');
    rows.push({
      LoadCell: String(idx),
      Multiplier: inputs[0].value,
      Addend: inputs[1].value,
    });
  });
  const result = await safeRequest(() => apiRequest('/api/calibration', {
    method: 'PUT',
    body: JSON.stringify({ calibration: rows }),
  }), 'Failed to save calibration');
  if (result) {
    showToast('Calibration saved');
    refreshSystemData();
  }
}

async function saveSettings() {
  const result = await safeRequest(() => apiRequest('/api/settings', {
    method: 'PUT',
    body: JSON.stringify({
      dataDir: elements.settingsDataDir.value,
      simulate: elements.settingsSimulate.checked,
    }),
  }), 'Failed to save settings');
  if (result) {
    showToast('Settings saved');
    refreshSettings();
  }
}

async function generatePdf() {
  if (!window.cmeasure || !window.cmeasure.generateReportPdf) {
    showToast('PDF export is only available in the Electron app');
    return;
  }
  document.body.classList.add('print-report');
  const result = await safeRequest(() => window.cmeasure.generateReportPdf(), 'PDF generation failed');
  document.body.classList.remove('print-report');
  if (result && !result.canceled) {
    showToast('PDF saved');
  }
}

function setCalibrationVisibility(isVisible) {
  if (isVisible) {
    elements.calibrationNav.classList.remove('is-hidden');
  } else {
    elements.calibrationNav.classList.add('is-hidden');
  }
}

function setupCalibrationUnlock() {
  const stored = localStorage.getItem('calibrationUnlocked');
  let unlocked = stored === 'true';
  let taps = 0;

  setCalibrationVisibility(unlocked);

  elements.brandTitle.addEventListener('click', () => {
    taps += 1;
    if (taps < 10) {
      return;
    }
    taps = 0;
    const code = window.prompt('Enter access code');
    if (code && code.trim().toLowerCase() === 'cal') {
      unlocked = true;
      localStorage.setItem('calibrationUnlocked', 'true');
      setCalibrationVisibility(true);
      setActiveView('calibration');
      showToast('Calibration unlocked');
    } else {
      showToast('Access denied');
    }
  });
}

function wireEvents() {
  elements.navItems.forEach((item) => {
    item.addEventListener('click', () => {
      setActiveView(item.dataset.view);
    });
  });

  elements.connectBtn.addEventListener('click', async () => {
    const result = await safeRequest(() => apiRequest('/api/connect', { method: 'POST' }), 'Failed to connect');
    if (result) {
      await refreshStatus();
      showToast('Connecting to sensors');
    }
  });

  elements.measureBtn.addEventListener('click', toggleContinuous);
  elements.addMeasurementBtn.addEventListener('click', addMeasurement);
  elements.zeroBtn.addEventListener('click', zeroSet);
  elements.compareBtn.addEventListener('click', compareReports);
  elements.pdfBtn.addEventListener('click', generatePdf);
  elements.saveCalibrationBtn.addEventListener('click', saveCalibration);
  elements.saveSettingsBtn.addEventListener('click', saveSettings);
}

async function init() {
  wireEvents();
  setupCalibrationUnlock();
  setActiveView('home');
  await refreshStatus();
  await refreshMeasurements();
  await refreshCalibration();
  await refreshSettings();
  await refreshSystemData();
  await refreshReportsList();
}

init();
