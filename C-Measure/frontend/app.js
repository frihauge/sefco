const PLOT_AXIS_PAD = 18;

let measurementDotsRaf = null;

const state = {
  view: 'home',
  continuous: false,
  timer: null,
  lastTest: null,
  connectTimer: null,
  connecting: false,
  statusTimer: null,
  previewTimer: null,
  showRaw: false,
  lastMeasurements: null,
  calibrationUnlocked: false,
  calibrationOffsetsSet: false,
  calibrationGainStatus: [],
  measurementView: 'table',
  reportView: 'plot',
  dataDir: '',
  frozenMeasurements: null,
  reportValuesA: null,
  reportValuesB: null,
  reportLabelA: 'Test 1',
  reportLabelB: 'Test 2',
  calibrationMissing: false,
  plotMaxX: null,
  lastStatuses: [],
  systemInfoCache: {
    systemSerial: '-',
    pairedSerial: '-',
    lastCalibrationAt: '-',
  },
  hubWifiOpen: false,
  lastBridge: null,
  reportLocalAContent: null,
  reportLocalBContent: null,
  reportLocalAName: '',
  reportLocalBName: '',
};

const elements = {
  navItems: document.querySelectorAll('.nav-item'),
  views: document.querySelectorAll('.view'),
  pageTitle: document.getElementById('page-title'),
  connectBtn: document.getElementById('connect-btn'),
  rawToggleInput: document.getElementById('raw-toggle'),
  rawToggleLabel: document.getElementById('raw-toggle-label'),
  measureToggleWrap: document.getElementById('measure-toggle-wrap'),
  measureToggleInput: document.getElementById('measure-toggle'),
  measureToggleLabel: document.getElementById('measure-toggle-label'),
  measurementNameWrap: document.getElementById('measurement-name-wrap'),
  addMeasurementBtn: document.getElementById('add-measurement-btn'),
  clearFrozenBtn: document.getElementById('clear-frozen-btn'),
  zeroBtn: document.getElementById('zero-btn'),
  sidebarConnection: document.getElementById('sidebar-connection'),
  homeConnected: document.getElementById('home-connected'),
  homeLastTest: document.getElementById('home-last-test'),
  homeDataDir: document.getElementById('home-data-dir'),
  calibrationWarning: document.getElementById('calibration-warning'),
  systemInfoCard: document.getElementById('system-info-card'),
  homeBridgeStatus: document.getElementById('home-bridge-status'),
  homeBridgeDetail: document.getElementById('home-bridge-detail'),
  hubConnectBtn: document.getElementById('hub-connect-btn'),
  hubHelp: document.getElementById('hub-help'),
  hubWifiPanel: document.getElementById('hub-wifi'),
  hubWifiList: document.getElementById('hub-wifi-list'),
  hubWifiPassword: document.getElementById('hub-wifi-password'),
  hubWifiRefresh: document.getElementById('hub-wifi-refresh'),
  hubWifiConnect: document.getElementById('hub-wifi-connect'),
  homeSystemSerial: document.getElementById('home-system-serial'),
  homePairedSerial: document.getElementById('home-paired-serial'),
  homeCalibrationTime: document.getElementById('home-calibration-time'),
  deviceStatusList: document.getElementById('device-status-list'),
  measurementTableBody: document.getElementById('measurement-table-body'),
  loadPlot: document.getElementById('load-plot'),
  measurementsToggle: document.getElementById('measurements-toggle'),
  measurementsTableCard: document.getElementById('measurements-table-card'),
  measurementsPlotCard: document.getElementById('measurements-plot-card'),
  measurementNameInput: document.getElementById('measurement-name'),
  reportsToggle: document.getElementById('reports-toggle'),
  reportPlotCard: document.getElementById('report-plot-card'),
  reportTableCard: document.getElementById('report-table-card'),
  reportTableBody: document.getElementById('report-table-body'),
  reportColA: document.getElementById('report-col-a'),
  reportColB: document.getElementById('report-col-b'),
  reportFileA: document.getElementById('report-file-a'),
  reportFileB: document.getElementById('report-file-b'),
  reportFileAPicker: document.getElementById('report-file-a-picker'),
  reportFileBPicker: document.getElementById('report-file-b-picker'),
  reportFileAName: document.getElementById('report-file-a-name'),
  reportFileBName: document.getElementById('report-file-b-name'),
  reportBrowseA: document.getElementById('report-browse-a'),
  reportBrowseB: document.getElementById('report-browse-b'),
  reportSelectA: document.getElementById('report-select-a'),
  reportSelectB: document.getElementById('report-select-b'),
  compareBtn: document.getElementById('compare-btn'),
  pdfBtn: document.getElementById('pdf-btn'),
  reportPlot: document.getElementById('report-plot'),
  reportStatusDots: document.getElementById('report-status-dots'),
  measurementStatusDots: document.getElementById('measurement-status-dots'),
  calibrationTableBody: document.getElementById('calibration-table-body'),
  saveCalibrationBtn: document.getElementById('save-calibration-btn'),
  calZeroBtn: document.getElementById('cal-zero-btn'),
  calGainWeight: document.getElementById('cal-gain-weight'),
  settingsDataDir: document.getElementById('settings-data-dir'),
  settingsPlotMax: document.getElementById('settings-plot-max'),
  saveSettingsBtn: document.getElementById('save-settings-btn'),
  systemInfo: document.getElementById('system-info'),
  toast: document.getElementById('toast'),
  brandTitle: document.getElementById('brand-title'),
  calibrationNav: document.getElementById('calibration-nav'),
  factoryNav: document.getElementById('factory-nav'),
  sidebarBridge: document.getElementById('sidebar-bridge'),
  factorySerialCurrent: document.getElementById('factory-serial-current'),
  factorySerialNew: document.getElementById('factory-serial-new'),
  factorySerialSave: document.getElementById('factory-serial-save'),
  factoryWifiSsid: document.getElementById('factory-wifi-ssid'),
  factoryWifiPassword: document.getElementById('factory-wifi-password'),
  factoryWifiSave: document.getElementById('factory-wifi-save'),
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
  updateTopbarActions(viewName);
  if (viewName !== 'home' && state.showRaw) {
    state.showRaw = false;
    updateRawToggle();
    startStatusPolling();
  }
  if (viewName === 'measurements') {
    setMeasurementView(state.measurementView);
    startMeasurementPreview();
  } else {
    stopMeasurementPreview();
    stopContinuousMeasure();
  }
  if (viewName === 'calibration') {
    stopMeasurementPreview();
    stopContinuousMeasure();
  }
  if (viewName === 'reports') {
    setReportView(state.reportView);
  }
}

function updateTopbarActions(viewName) {
  const isMeasurements = viewName === 'measurements';

  if (elements.measureToggleWrap) {
    elements.measureToggleWrap.classList.toggle('is-hidden', !isMeasurements);
  }
  if (elements.measurementNameWrap) {
    elements.measurementNameWrap.classList.toggle('is-hidden', !isMeasurements);
  }
  if (elements.addMeasurementBtn) {
    elements.addMeasurementBtn.classList.toggle('is-hidden', !isMeasurements);
  }
  if (elements.clearFrozenBtn) {
    elements.clearFrozenBtn.classList.toggle('is-hidden', !isMeasurements);
  }
  updateMeasureToggle();
}

function setMeasurementView(view) {
  const mode = view === 'plot' ? 'plot' : 'table';
  state.measurementView = mode;
  if (elements.measurementsTableCard) {
    elements.measurementsTableCard.classList.toggle('is-hidden', mode !== 'table');
  }
  if (elements.measurementsPlotCard) {
    elements.measurementsPlotCard.classList.toggle('is-hidden', mode !== 'plot');
  }
  if (elements.measurementsToggle) {
    elements.measurementsToggle.querySelectorAll('.toggle-btn').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.view === mode);
    });
  }
  if (mode === 'plot') {
    scheduleMeasurementDotsLayout();
  }
}

function setReportView(view) {
  const mode = view === 'table' ? 'table' : 'plot';
  state.reportView = mode;
  if (elements.reportPlotCard) {
    elements.reportPlotCard.classList.toggle('is-hidden', mode !== 'plot');
  }
  if (elements.reportTableCard) {
    elements.reportTableCard.classList.toggle('is-hidden', mode !== 'table');
  }
  if (elements.reportsToggle) {
    elements.reportsToggle.querySelectorAll('.toggle-btn').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.view === mode);
    });
  }
  updateReportTable();
}

function stopContinuousMeasure() {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  state.continuous = false;
  updateMeasureToggle();
}

function updateMeasureToggle() {
  const input = elements.measureToggleInput;
  if (!input) {
    return;
  }
  input.checked = state.continuous;
  if (elements.measureToggleLabel) {
    elements.measureToggleLabel.textContent = state.continuous ? 'Measure ON' : 'Measure OFF';
  }
}

function normalizeStatus(status) {
  if (status === 'Connected' || status === 'Connecting') {
    return status;
  }
  return 'Disconnected';
}

function renderStatusDots(container, statuses, reverse = true, svg = null) {
  if (!container) {
    return;
  }
  container.innerHTML = '';
  const ordered = reverse ? [...statuses].reverse() : statuses;
  ordered.forEach((status) => {
    const dot = document.createElement('span');
    dot.className = 'status-dot';
    if (status !== 'Connected') {
      dot.classList.add('is-warning');
    }
    container.appendChild(dot);
  });
  container.style.gridTemplateRows = `repeat(${ordered.length || 1}, 1fr)`;
  if (svg) {
    const { height: viewHeight } = getSvgSize(svg);
    const svgRect = svg.getBoundingClientRect();
    if (svgRect.height < 10) {
      return;
    }
    const wrap = svg.closest('.plot-wrap');
    const wrapStyle = wrap ? getComputedStyle(wrap) : null;
    const padTop = wrapStyle ? parseFloat(wrapStyle.paddingTop) || 0 : 0;
    const padBottom = wrapStyle ? parseFloat(wrapStyle.paddingBottom) || 0 : 0;
    const axisPad = viewHeight ? (PLOT_AXIS_PAD / viewHeight) * svgRect.height : 0;
    container.style.marginTop = `${padTop}px`;
    container.style.marginBottom = `${padBottom}px`;
    container.style.height = `${svgRect.height}px`;
    container.style.paddingTop = `${axisPad}px`;
    container.style.paddingBottom = `${axisPad}px`;
  } else {
    container.style.marginTop = '';
    container.style.marginBottom = '';
    container.style.height = '';
    container.style.paddingTop = '';
    container.style.paddingBottom = '';
  }
}

function renderStatus(statuses, measurements = null) {
  const normalized = statuses.map((status) => normalizeStatus(status));
  state.lastStatuses = normalized;
  const connected = normalized.filter((s) => s === 'Connected').length;
  elements.homeConnected.textContent = `${connected} / ${normalized.length}`;
  elements.deviceStatusList.innerHTML = '';
  normalized.forEach((status, idx) => {
    const raw = measurements && measurements[idx] ? measurements[idx].raw : null;
    const showRawDiv = state.showRaw;
    const rawValue = Number.isFinite(raw) ? formatNumber(raw, 6) : 'null';
    const card = document.createElement('div');
    card.className = status === 'Connected' ? 'device-card is-connected' : 'device-card is-warning';
    card.innerHTML = `
      <div class="device-meta">
        <div class="device-label">Cell ${idx + 1}</div>
        ${showRawDiv ? `<div class="device-raw">Raw: ${rawValue}</div>` : ''}
      </div>
      <div class="device-status">${status}</div>
    `;
    elements.deviceStatusList.appendChild(card);
  });

  renderStatusDots(elements.measurementStatusDots, normalized, true, elements.loadPlot);
  updateRawAvailability(normalized);
}

function statusBadge(status) {
  const normalized = normalizeStatus(status);
  const base = document.createElement('span');
  base.className = 'status-badge';
  if (normalized === 'Connected') {
    base.classList.add('is-connected');
  } else {
    base.classList.add('is-warning');
  }
  base.textContent = normalized;
  return base;
}

function formatNumber(value, digits = 5) {
  if (!Number.isFinite(value)) {
    return '-';
  }
  return value.toFixed(digits);
}

function buildHeightLabels(count) {
  const labels = [];
  for (let i = 0; i < count; i += 1) {
    labels.push(`${(i + 1) * 15} cm`);
  }
  return labels;
}

function updateSidebarStatus(statuses) {
  if (!elements.sidebarConnection) {
    return;
  }
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
    indicator.className = 'status-dot is-warning';
    text.textContent = 'Cells disconnected';
  }
}

function updateBridgeStatus(bridge) {
  const sidebar = elements.sidebarBridge;
  const home = elements.homeBridgeStatus;
  const detail = elements.homeBridgeDetail;
  const applyStatus = (container) => {
    if (!container) {
      return;
    }
    const indicator = container.querySelector('.status-dot');
    const text = container.querySelector('span:last-child');
    if (!indicator || !text) {
      return;
    }
    if (!bridge) {
      indicator.className = 'status-dot is-warning';
      text.textContent = 'Hub: checking...';
      return;
    }
    if (bridge.simulated) {
      indicator.className = 'status-dot';
      text.textContent = 'C-Measure: simulation';
      return;
    }
    if (bridge.reachable) {
      indicator.className = 'status-dot';
      text.textContent = 'C-Measure: active';
    } else {
      indicator.className = 'status-dot is-error';
      text.textContent = 'C-Measure: offline';
    }
  };
  applyStatus(sidebar);
  applyStatus(home);
  if (detail) {
    if (bridge && bridge.host) {
      const hostLine = bridge.port ? `${bridge.host}:${bridge.port}` : bridge.host;
      detail.textContent = `Host: ${hostLine}`;
    } else {
      detail.textContent = 'Host: -';
    }
  }
  const isOffline = bridge && !bridge.simulated && bridge.reachable === false;
  if (elements.hubConnectBtn) {
    elements.hubConnectBtn.classList.toggle('is-hidden', !isOffline);
  }
  if (elements.hubHelp) {
    elements.hubHelp.classList.toggle('is-hidden', !isOffline);
  }
  if (elements.hubWifiPanel) {
    elements.hubWifiPanel.classList.toggle('is-hidden', !isOffline || !state.hubWifiOpen);
    if (!isOffline) {
      state.hubWifiOpen = false;
    }
  }

  if (isOffline) {
    elements.homeSystemSerial.textContent = 'System: -';
    elements.homePairedSerial.textContent = 'Paired: -';
    elements.homeCalibrationTime.textContent = 'Last calibration: -';
  } else {
    elements.homeSystemSerial.textContent = `System: ${state.systemInfoCache.systemSerial || '-'}`;
    elements.homePairedSerial.textContent = `Paired: ${state.systemInfoCache.pairedSerial || '-'}`;
    const calibrationText = state.calibrationMissing ? '-' : (state.systemInfoCache.lastCalibrationAt || '-');
    elements.homeCalibrationTime.textContent = `Last calibration: ${calibrationText}`;
  }
}

function renderMeasurementsTable(measurements) {
  elements.measurementTableBody.innerHTML = '';
  measurements.forEach((item) => {
    const normalized = normalizeStatus(item.status);
    const row = document.createElement('tr');
    const statusCell = document.createElement('td');
    statusCell.appendChild(statusBadge(normalized));
    const value = normalized === 'Connected' && Number.isFinite(item.value)
      ? formatNumber(item.value, 5)
      : 'Error';

    row.innerHTML = `
      <td>${item.id + 1}</td>
      <td></td>
      <td>${value}</td>
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
  const top = PLOT_AXIS_PAD;
  const bottom = height - PLOT_AXIS_PAD;
  const plotWidth = right - left;
  const plotHeight = bottom - top;
  const maxSetting = Number(state.plotMaxX);
  const baseMax = Number.isFinite(maxSetting) && maxSetting > 0 ? maxSetting : Math.max(...series.flat(), 1);
  const maxVal = Math.max(baseMax, 1);
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
      const y = bottom - (i * plotHeight) / Math.max(labels.length - 1, 1);
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
        const clamped = Math.max(0, Math.min(value, maxVal));
        const x = left + (clamped / maxVal) * plotWidth;
        const y = bottom - (i * plotHeight) / Math.max(values.length - 1, 1);
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

function renderMeasurementPlot(values) {
  const liveValues = Array.isArray(values) ? values : [];
  const frozen = Array.isArray(state.frozenMeasurements) ? state.frozenMeasurements : null;
  const series = [];
  const colors = [];
  if (frozen && frozen.length) {
    series.push(frozen);
    colors.push('#9aa7bd');
  }
  series.push(liveValues);
  colors.push('#f26a4b');
  renderAreaPlot(
    elements.loadPlot,
    series,
    colors,
    buildHeightLabels(Math.max(...series.map((s) => s.length), 1)),
  );
}

function updateReportTable() {
  if (!elements.reportTableBody) {
    return;
  }
  const valuesA = Array.isArray(state.reportValuesA) ? state.reportValuesA : [];
  const valuesB = Array.isArray(state.reportValuesB) ? state.reportValuesB : [];
  const maxRows = Math.max(valuesA.length, valuesB.length, 0);
  elements.reportTableBody.innerHTML = '';
  for (let i = 0; i < maxRows; i += 1) {
    const row = document.createElement('tr');
    const valueA = Number.isFinite(valuesA[i]) ? formatNumber(valuesA[i]) : '-';
    const valueB = Number.isFinite(valuesB[i]) ? formatNumber(valuesB[i]) : '-';
    row.innerHTML = `
      <td>Cell ${i + 1}</td>
      <td>${valueA}</td>
      <td>${valueB}</td>
    `;
    elements.reportTableBody.appendChild(row);
  }
  if (elements.reportColA) {
    elements.reportColA.textContent = state.reportLabelA || 'Test 1';
  }
  if (elements.reportColB) {
    elements.reportColB.textContent = state.reportLabelB || 'Test 2';
  }
}

function setReportData(valuesA, valuesB, labelA, labelB) {
  state.reportValuesA = valuesA || [];
  state.reportValuesB = valuesB || [];
  state.reportLabelA = labelA || 'Test 1';
  state.reportLabelB = labelB || 'Test 2';
  updateReportTable();
}

function updateCalibrationWarning() {
  if (!elements.calibrationWarning) {
    return;
  }
  const bridge = state.lastBridge;
  const hubOnline = bridge && bridge.reachable === true && !bridge.simulated;
  const show = hubOnline && state.calibrationMissing;
  elements.calibrationWarning.classList.toggle('is-hidden', !show);
  if (elements.systemInfoCard) {
    elements.systemInfoCard.classList.toggle('is-warning', show);
  }
}

function updateRawAvailability(statuses) {
  if (!elements.rawToggleInput) {
    return;
  }
  const connected = statuses.filter((s) => s === 'Connected').length;
  const hasConnected = connected > 0;
  elements.rawToggleInput.disabled = !hasConnected;
  const wrapper = elements.rawToggleInput.closest('.toggle');
  if (wrapper) {
    wrapper.classList.toggle('is-disabled', !hasConnected);
  }
  if (!hasConnected && state.showRaw) {
    state.showRaw = false;
    updateRawToggle();
  }
}

function updateMeasurementDotsLayout() {
  if (!elements.measurementStatusDots || !elements.loadPlot) {
    return;
  }
  if (state.view !== 'measurements' || state.measurementView !== 'plot') {
    return;
  }
  const rect = elements.loadPlot.getBoundingClientRect();
  if (rect.height < 10) {
    return;
  }
  const statuses = Array.isArray(state.lastStatuses) ? state.lastStatuses : [];
  if (statuses.length === 0) {
    return;
  }
  renderStatusDots(elements.measurementStatusDots, statuses, true, elements.loadPlot);
}

function scheduleMeasurementDotsLayout() {
  if (measurementDotsRaf) {
    cancelAnimationFrame(measurementDotsRaf);
  }
  measurementDotsRaf = requestAnimationFrame(() => {
    measurementDotsRaf = null;
    updateMeasurementDotsLayout();
  });
}

function canCompareLocalFiles() {
  const hasContent = Boolean(state.reportLocalAContent && state.reportLocalBContent);
  const hasInputs = Boolean(
    elements.reportFileA?.files?.length &&
    elements.reportFileB?.files?.length,
  );
  return hasContent || hasInputs;
}

function canCompareSavedTests() {
  return Boolean(elements.reportSelectA?.value && elements.reportSelectB?.value);
}

function hasSingleSavedTest() {
  const a = elements.reportSelectA?.value;
  const b = elements.reportSelectB?.value;
  return (a && !b) || (!a && b);
}

async function showSingleReport() {
  const selectedA = elements.reportSelectA?.value;
  const selectedB = elements.reportSelectB?.value;
  const selected = selectedA || selectedB;
  const side = selectedA ? 'A' : 'B';

  if (!selected) {
    return;
  }

  const result = await safeRequest(() => apiRequest('/api/reports/single', {
    method: 'POST',
    body: JSON.stringify({ file: selected }),
  }));

  if (!result) {
    return;
  }

  const values = result.values || [];
  const color = side === 'A' ? '#f04d4d' : '#2f7de1';
  renderAreaPlot(elements.reportPlot, [values], [color], buildHeightLabels(values.length));

  // Update table with single test data
  const label = getBaseName(selected) || 'Test';
  if (side === 'A') {
    setReportData(values, [], label, '-');
  } else {
    setReportData([], values, '-', label);
  }

  showToast(`Showing: ${getBaseName(selected)}`);
}

function maybeAutoCompareReports() {
  if (canCompareLocalFiles() || canCompareSavedTests()) {
    compareReports();
  } else if (hasSingleSavedTest()) {
    showSingleReport();
  }
}

async function refreshStatus({ silent = false } = {}) {
  const status = await safeRequest(() => apiRequest('/api/status'), silent ? null : 'Backend not reachable');
  if (!status) {
    return null;
  }
  renderStatus(status.statuses);
  updateSidebarStatus(status.statuses);
  state.lastBridge = status.bridge;
  updateBridgeStatus(status.bridge);
  state.calibrationMissing = Boolean(status.calibrationMissing);
  updateCalibrationWarning();
  return status;
}

async function loadWifiNetworks() {
  const data = await safeRequest(() => apiRequest('/api/wifi/networks'), 'Failed to list WiFi');
  if (!data || !elements.hubWifiList) {
    return;
  }
  const networks = data.networks || [];
  elements.hubWifiList.innerHTML = '';
  if (networks.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No networks found';
    elements.hubWifiList.appendChild(option);
    return;
  }
  networks.forEach((net) => {
    const option = document.createElement('option');
    option.value = net.ssid;
    const signal = Number.isFinite(net.signal) ? ` (${net.signal}%)` : '';
    option.textContent = `${net.ssid}${signal}`;
    elements.hubWifiList.appendChild(option);
  });
}

function stopStatusPolling() {
  if (state.statusTimer) {
    clearInterval(state.statusTimer);
    state.statusTimer = null;
  }
}

function startStatusPolling() {
  stopStatusPolling();
  const interval = state.showRaw ? 1000 : 2000;
  state.statusTimer = setInterval(() => {
    if (state.showRaw) {
      refreshMeasurements();
    } else {
      refreshStatus({ silent: true });
    }
  }, interval);
}

function stopConnectPolling() {
  if (state.connectTimer) {
    clearInterval(state.connectTimer);
    state.connectTimer = null;
  }
}

function stopMeasurementPreview() {
  if (state.previewTimer) {
    clearInterval(state.previewTimer);
    state.previewTimer = null;
  }
}

function startMeasurementPreview() {
  if (state.previewTimer || state.continuous || state.view !== 'measurements') {
    return;
  }
  state.previewTimer = setInterval(() => {
    refreshMeasurements();
  }, 1000);
}

function startConnectPolling() {
  stopConnectPolling();
  let attempts = 0;
  state.connectTimer = setInterval(async () => {
    attempts += 1;
    const status = await refreshStatus({ silent: true });
    if (!status) {
      return;
    }
    const statuses = status.statuses || [];
    const stillConnecting = statuses.some((s) => s === 'Connecting');
    if (!stillConnecting || attempts >= 40) {
      stopConnectPolling();
      state.connecting = false;
      elements.connectBtn.disabled = false;
    }
  }, 1000);
}

function updateRawToggle() {
  const input = elements.rawToggleInput;
  if (!input) {
    return;
  }
  input.checked = state.showRaw;
  if (elements.rawToggleLabel) {
    elements.rawToggleLabel.textContent = state.showRaw ? 'Raw ON' : 'Raw OFF';
  }
}

async function refreshMeasurements() {
  const data = await safeRequest(() => apiRequest('/api/measurements'));
  if (!data) {
    return;
  }
  state.lastMeasurements = data.measurements || null;
  if (state.lastMeasurements) {
    renderStatus(state.lastMeasurements.map((m) => m.status), state.lastMeasurements);
  }
  renderMeasurementsTable(data.measurements);
  updateRawToggle();
  const values = data.measurements.map((m) => m.value);
  renderMeasurementPlot(values);
  scheduleMeasurementDotsLayout();
}

async function refreshCalibration() {
  const data = await safeRequest(() => apiRequest('/api/calibration'));
  if (!data) {
    return;
  }
  if (!Array.isArray(state.calibrationGainStatus) || state.calibrationGainStatus.length !== data.calibration.length) {
    state.calibrationGainStatus = new Array(data.calibration.length).fill(false);
  }
  elements.calibrationTableBody.innerHTML = '';
  data.calibration.forEach((row, idx) => {
    const tr = document.createElement('tr');
    const gainDone = state.calibrationGainStatus[idx] === true;
    tr.className = `cal-row ${gainDone ? 'is-done' : 'is-pending'}`;
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td><input class="field-input" data-field="Offset" value="${row.Offset ?? ''}" /></td>
      <td><input class="field-input" data-field="Gain" value="${row.Gain ?? ''}" /></td>
      <td><button class="btn ghost compact" data-action="set-gain" data-index="${idx}">Set Gain</button></td>
    `;
    elements.calibrationTableBody.appendChild(tr);
  });
  if (state.calibrationOffsetsSet) {
    elements.calibrationTableBody.querySelectorAll('input[data-field="Offset"]').forEach((input) => {
      input.classList.add('is-offset-done');
    });
  }
}

async function handleCalibrationZero() {
  if (!elements.calZeroBtn) {
    return;
  }
  state.calibrationOffsetsSet = false;
  elements.calibrationTableBody.querySelectorAll('input[data-field="Offset"]').forEach((input) => {
    input.classList.remove('is-offset-done');
  });
  elements.calibrationTableBody.querySelectorAll('tr').forEach((row) => {
    row.classList.remove('is-pending', 'is-done');
    row.classList.add('is-active');
  });
  elements.calZeroBtn.disabled = true;
  const result = await safeRequest(
    () => apiRequest('/api/calibration/zero', { method: 'POST' }),
    'Failed to set zero',
  );
  elements.calZeroBtn.disabled = false;
  if (result) {
    state.calibrationOffsetsSet = true;
    state.calibrationGainStatus = state.calibrationGainStatus.map(() => false);
    await refreshCalibration();
    showToast('Offsets updated');
  } else {
    elements.calibrationTableBody.querySelectorAll('tr').forEach((row) => {
      row.classList.remove('is-active');
      row.classList.add('is-pending');
    });
  }
}

async function handleCalibrationGain(cellIndex, button) {
  const weightValue = elements.calGainWeight ? parseFloat(elements.calGainWeight.value) : NaN;
  if (!Number.isFinite(weightValue)) {
    showToast('Enter a valid gain weight');
    return;
  }
  const row = button ? button.closest('tr') : null;
  if (row) {
    row.classList.remove('is-pending', 'is-done');
    row.classList.add('is-active');
  }
  if (button) {
    button.disabled = true;
  }
  const result = await safeRequest(() => apiRequest('/api/calibration/gain', {
    method: 'POST',
    body: JSON.stringify({ cell: cellIndex, weight: weightValue }),
  }), 'Failed to set gain');
  if (button) {
    button.disabled = false;
  }
  if (result) {
    state.calibrationGainStatus[cellIndex] = true;
    await refreshCalibration();
    showToast(`Gain set for Cell ${cellIndex + 1}`);
  } else if (row) {
    row.classList.remove('is-active');
    row.classList.add('is-pending');
  }
}

async function refreshSettings() {
  const settings = await safeRequest(() => apiRequest('/api/settings'));
  if (!settings) {
    return;
  }
  state.dataDir = settings.dataDir || '';
  const plotMaxRaw = settings.plotMaxX;
  const plotMaxValue = Number.isFinite(plotMaxRaw) ? plotMaxRaw : parseFloat(plotMaxRaw);
  if (Number.isFinite(plotMaxValue) && plotMaxValue > 0) {
    state.plotMaxX = plotMaxValue;
  }
  elements.settingsDataDir.value = settings.dataDir || '';
  if (elements.settingsPlotMax) {
    elements.settingsPlotMax.value = state.plotMaxX ?? elements.settingsPlotMax.value ?? '';
  }
  elements.homeDataDir.textContent = settings.dataDir || 'backend/data';
  elements.systemInfo.innerHTML = `
    <div>Backend: ${settings.simulate ? 'Simulation' : 'Live'}</div>
    <div>Data folder: ${settings.dataDir}</div>
  `;
}

async function ensureDataDir() {
  if (state.dataDir) {
    return state.dataDir;
  }
  await refreshSettings();
  return state.dataDir;
}

async function refreshSystemData() {
  const system = await safeRequest(() => apiRequest('/api/system'));
  if (!system) {
    return;
  }
  state.systemInfoCache = {
    systemSerial: system.systemSerial || '-',
    pairedSerial: system.pairedSerial || '-',
    lastCalibrationAt: system.lastCalibrationAt || '-',
  };
  elements.homeSystemSerial.textContent = `System: ${state.systemInfoCache.systemSerial}`;
  elements.homePairedSerial.textContent = `Paired: ${state.systemInfoCache.pairedSerial}`;
  elements.homeCalibrationTime.textContent = `Last calibration: ${state.systemInfoCache.lastCalibrationAt}`;
  if (elements.factorySerialCurrent) {
    elements.factorySerialCurrent.value = system.systemSerial || '';
  }
  if (elements.factoryWifiSsid) {
    elements.factoryWifiSsid.value = system.wifiSsid || '';
  }
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

function getBaseName(path) {
  if (!path) {
    return '';
  }
  const parts = path.split(/[/\\\\]/);
  return parts[parts.length - 1] || path;
}

function getMeasurementsDir() {
  const baseDir = state.dataDir || (elements.homeDataDir ? elements.homeDataDir.textContent : '') || 'backend/data';
  if (!baseDir) {
    return undefined;
  }
  const trimmed = baseDir.replace(/[\\/]+$/, '');
  const separator = trimmed.includes('\\') ? '\\' : '/';
  return `${trimmed}${separator}measurements`;
}

function setLocalReport(side, content, name) {
  if (side === 'a') {
    state.reportLocalAContent = content;
    state.reportLocalAName = name || '';
    if (elements.reportFileAName) {
      elements.reportFileAName.value = name || '';
    }
  } else {
    state.reportLocalBContent = content;
    state.reportLocalBName = name || '';
    if (elements.reportFileBName) {
      elements.reportFileBName.value = name || '';
    }
  }
}

async function compareReports() {
  const fileA = state.reportLocalAContent ?? await readFile(elements.reportFileA);
  const fileB = state.reportLocalBContent ?? await readFile(elements.reportFileB);

  if (fileA && fileB) {
    const valuesA = parseCsv(fileA);
    const valuesB = parseCsv(fileB);
    renderAreaPlot(elements.reportPlot, [valuesA, valuesB], ['#f04d4d', '#2f7de1'], buildHeightLabels(Math.max(valuesA.length, valuesB.length)));
    const labelA = state.reportLocalAName || getBaseName(elements.reportFileA?.value) || 'Test 1';
    const labelB = state.reportLocalBName || getBaseName(elements.reportFileB?.value) || 'Test 2';
    setReportData(valuesA, valuesB, labelA, labelB);
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
  setReportData(valuesA, valuesB, getBaseName(selectedA) || 'Test 1', getBaseName(selectedB) || 'Test 2');
  showToast('Compared saved tests');
}

async function addMeasurement() {
  const name = elements.measurementNameInput ? elements.measurementNameInput.value.trim() : '';
  const payload = name ? { name } : {};
  const result = await safeRequest(() => apiRequest('/api/measurements', {
    method: 'POST',
    body: JSON.stringify(payload),
  }), 'Failed to save measurement');
  if (!result) {
    return;
  }
  if (state.lastMeasurements) {
    state.frozenMeasurements = state.lastMeasurements.map((m) => m.value);
  }
  state.lastTest = result.file;
  elements.homeLastTest.textContent = result.file || 'None';
  showToast('Measurement saved');
  if (elements.measurementNameInput) {
    elements.measurementNameInput.value = '';
  }
  if (state.lastMeasurements) {
    renderMeasurementPlot(state.lastMeasurements.map((m) => m.value));
  }
  await refreshMeasurements();
  refreshReportsList();
}

function clearFrozenPlot() {
  state.frozenMeasurements = null;
  if (state.lastMeasurements) {
    renderMeasurementPlot(state.lastMeasurements.map((m) => m.value));
  } else {
    renderMeasurementPlot([]);
  }
}

async function zeroSet() {
  const result = await safeRequest(() => apiRequest('/api/zero', { method: 'POST' }), 'Failed to zero set');
  if (result) {
    showToast('Zero set applied');
    refreshMeasurements();
  }
}

function toggleContinuous() {
  if (elements.measureToggleInput) {
    state.continuous = elements.measureToggleInput.checked;
  } else {
    state.continuous = !state.continuous;
  }
  updateMeasureToggle();
  if (state.continuous) {
    stopMeasurementPreview();
    refreshMeasurements();
    if (state.timer) {
      clearInterval(state.timer);
    }
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
      Offset: inputs[0].value,
      Gain: inputs[1].value,
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
  const maxInput = elements.settingsPlotMax ? elements.settingsPlotMax.value.trim() : '';
  const maxValue = parseFloat(maxInput);
  state.plotMaxX = Number.isFinite(maxValue) && maxValue > 0 ? maxValue : null;
  if (elements.settingsPlotMax) {
    elements.settingsPlotMax.value = state.plotMaxX ?? '';
  }
  const result = await safeRequest(() => apiRequest('/api/settings', {
    method: 'PUT',
    body: JSON.stringify({
      dataDir: elements.settingsDataDir.value,
      plotMaxX: Number.isFinite(maxValue) && maxValue > 0 ? maxValue : null,
    }),
  }), 'Failed to save settings');
  if (result) {
    showToast('Settings saved');
    await refreshSettings();
    refreshMeasurements();
    maybeAutoCompareReports();
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

function setCalibrationUnlocked(isUnlocked) {
  state.calibrationUnlocked = isUnlocked;
  setCalibrationVisibility(isUnlocked);
}

function setFactoryVisibility(isVisible) {
  if (isVisible) {
    elements.factoryNav.classList.remove('is-hidden');
  } else {
    elements.factoryNav.classList.add('is-hidden');
  }
}

function setFactoryUnlocked(isUnlocked) {
  setFactoryVisibility(isUnlocked);
}

function showPrompt(title = 'Enter value') {
  return new Promise((resolve) => {
    const modal = document.getElementById('prompt-modal');
    const titleEl = document.getElementById('prompt-title');
    const input = document.getElementById('prompt-input');
    const okBtn = document.getElementById('prompt-ok');
    const cancelBtn = document.getElementById('prompt-cancel');

    titleEl.textContent = title;
    input.value = '';
    modal.style.display = 'flex';

    // Focus input after a short delay to ensure modal is visible
    setTimeout(() => {
      input.focus();
    }, 100);

    function cleanup() {
      modal.style.display = 'none';
      okBtn.removeEventListener('click', handleOk);
      cancelBtn.removeEventListener('click', handleCancel);
      input.removeEventListener('keydown', handleKeydown);
    }

    function handleOk() {
      const value = input.value;
      cleanup();
      resolve(value);
    }

    function handleCancel() {
      cleanup();
      resolve(null);
    }

    function handleKeydown(e) {
      if (e.key === 'Enter') {
        handleOk();
      } else if (e.key === 'Escape') {
        handleCancel();
      }
    }

    okBtn.addEventListener('click', handleOk);
    cancelBtn.addEventListener('click', handleCancel);
    input.addEventListener('keydown', handleKeydown);
  });
}

function setupCalibrationUnlock() {
  let taps = 0;

  setCalibrationUnlocked(false);
  setFactoryUnlocked(false);

  elements.brandTitle.addEventListener('click', async () => {
    taps += 1;
    if (taps < 10) {
      return;
    }
    taps = 0;
    const code = await showPrompt('Enter access code');
    if (code && code.trim().toLowerCase() === 'cal') {
      setCalibrationUnlocked(true);
      setActiveView('calibration');
      showToast('Calibration unlocked');
    } else if (code && code.trim().toLowerCase() === 'fset') {
      setFactoryUnlocked(true);
      setActiveView('factory');
      showToast('Factory settings unlocked');
    } else if (code) {
      showToast('Access denied');
    }
  });
}

function wireEvents() {
  elements.navItems.forEach((item) => {
    item.addEventListener('click', () => {
      const targetView = item.dataset.view;
      setActiveView(targetView);
      if (targetView !== 'calibration' && state.calibrationUnlocked) {
        setCalibrationUnlocked(false);
      }
      if (targetView !== 'factory') {
        setFactoryUnlocked(false);
      }
    });
  });

  if (elements.measurementsToggle) {
    elements.measurementsToggle.addEventListener('click', (event) => {
      const button = event.target.closest('.toggle-btn');
      if (!button) {
        return;
      }
      setMeasurementView(button.dataset.view);
    });
  }

  if (elements.reportsToggle) {
    elements.reportsToggle.addEventListener('click', (event) => {
      const button = event.target.closest('.toggle-btn');
      if (!button) {
        return;
      }
      setReportView(button.dataset.view);
    });
  }

  window.addEventListener('resize', () => {
    scheduleMeasurementDotsLayout();
  });

  elements.connectBtn.addEventListener('click', async () => {
    if (state.connecting) {
      return;
    }
    state.connecting = true;
    elements.connectBtn.disabled = true;
    const result = await safeRequest(() => apiRequest('/api/connect', { method: 'POST' }), 'Failed to connect');
    if (result) {
      await refreshStatus();
      showToast('Connecting to sensors');
      startConnectPolling();
      return;
    }
    state.connecting = false;
    elements.connectBtn.disabled = false;
  });

  if (elements.rawToggleInput) {
    elements.rawToggleInput.addEventListener('change', () => {
      state.showRaw = elements.rawToggleInput.checked;
      updateRawToggle();
      startStatusPolling();
      if (state.showRaw) {
        refreshMeasurements();
        return;
      }
      if (state.lastMeasurements) {
        renderStatus(state.lastMeasurements.map((m) => m.status), state.lastMeasurements);
        return;
      }
      refreshStatus({ silent: true });
    });
  }

  elements.calZeroBtn.addEventListener('click', handleCalibrationZero);

  elements.calibrationTableBody.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action="set-gain"]');
    if (!button) {
      return;
    }
    const idx = parseInt(button.dataset.index, 10);
    if (Number.isNaN(idx)) {
      return;
    }
    handleCalibrationGain(idx, button);
  });

  elements.factorySerialSave.addEventListener('click', async () => {
    const serial = elements.factorySerialNew.value.trim();
    if (!serial) {
      showToast('Enter a serial number');
      return;
    }
    const result = await safeRequest(() => apiRequest('/api/system/serial', {
      method: 'PUT',
      body: JSON.stringify({ serial }),
    }), 'Failed to save serial');
    if (result) {
      elements.factorySerialNew.value = '';
      await refreshSystemData();
      showToast('Serial updated');
    }
  });

  if (elements.hubConnectBtn) {
    elements.hubConnectBtn.addEventListener('click', () => {
      state.hubWifiOpen = !state.hubWifiOpen;
      if (state.hubWifiOpen) {
        loadWifiNetworks();
      }
      updateBridgeStatus(state.lastBridge || { reachable: false, simulated: false });
    });
  }

  if (elements.hubWifiRefresh) {
    elements.hubWifiRefresh.addEventListener('click', () => {
      loadWifiNetworks();
    });
  }

  if (elements.hubWifiConnect) {
    elements.hubWifiConnect.addEventListener('click', async () => {
      const ssid = elements.hubWifiList ? elements.hubWifiList.value : '';
      const password = elements.hubWifiPassword ? elements.hubWifiPassword.value : '';
      if (!ssid) {
        showToast('Select a WiFi network');
        return;
      }
      const result = await safeRequest(() => apiRequest('/api/wifi/connect', {
        method: 'PUT',
        body: JSON.stringify({ ssid, password }),
      }), 'Failed to connect WiFi');
      if (result) {
        showToast('Connecting to WiFi');
      }
    });
  }

  if (elements.factoryWifiSave) {
    elements.factoryWifiSave.addEventListener('click', async () => {
      const ssid = elements.factoryWifiSsid ? elements.factoryWifiSsid.value.trim() : '';
      const password = elements.factoryWifiPassword ? elements.factoryWifiPassword.value : '';
      if (!ssid) {
        showToast('Enter WiFi SSID');
        return;
      }
      const result = await safeRequest(() => apiRequest('/api/system/wifi', {
        method: 'PUT',
        body: JSON.stringify({ ssid, password }),
      }), 'Failed to save WiFi');
      if (result) {
        showToast('WiFi saved');
        await refreshSystemData();
      }
    });
  }

  if (elements.reportBrowseA) {
    elements.reportBrowseA.addEventListener('click', async () => {
      if (window.cmeasure && window.cmeasure.openReportFile) {
        await ensureDataDir();
        const defaultPath = getMeasurementsDir();
        const filePath = await window.cmeasure.openReportFile(defaultPath);
        if (!filePath) {
          return;
        }
        const content = await window.cmeasure.readFile(filePath);
        setLocalReport('a', content, getBaseName(filePath));
        maybeAutoCompareReports();
        return;
      }
      if (elements.reportFileA) {
        elements.reportFileA.click();
      }
    });
  }

  if (elements.reportBrowseB) {
    elements.reportBrowseB.addEventListener('click', async () => {
      if (window.cmeasure && window.cmeasure.openReportFile) {
        await ensureDataDir();
        const defaultPath = getMeasurementsDir();
        const filePath = await window.cmeasure.openReportFile(defaultPath);
        if (!filePath) {
          return;
        }
        const content = await window.cmeasure.readFile(filePath);
        setLocalReport('b', content, getBaseName(filePath));
        maybeAutoCompareReports();
        return;
      }
      if (elements.reportFileB) {
        elements.reportFileB.click();
      }
    });
  }

  if (elements.reportFileA) {
    elements.reportFileA.addEventListener('change', () => {
      const file = elements.reportFileA.files && elements.reportFileA.files[0];
      state.reportLocalAContent = null;
      state.reportLocalAName = file ? file.name : '';
      if (elements.reportFileAName) {
        elements.reportFileAName.value = file ? file.name : '';
      }
      maybeAutoCompareReports();
    });
  }

  if (elements.reportFileB) {
    elements.reportFileB.addEventListener('change', () => {
      const file = elements.reportFileB.files && elements.reportFileB.files[0];
      state.reportLocalBContent = null;
      state.reportLocalBName = file ? file.name : '';
      if (elements.reportFileBName) {
        elements.reportFileBName.value = file ? file.name : '';
      }
      maybeAutoCompareReports();
    });
  }

  if (elements.measureToggleInput) {
    elements.measureToggleInput.addEventListener('change', toggleContinuous);
  }
  if (elements.clearFrozenBtn) {
    elements.clearFrozenBtn.addEventListener('click', clearFrozenPlot);
  }
  elements.addMeasurementBtn.addEventListener('click', addMeasurement);
  elements.zeroBtn.addEventListener('click', zeroSet);
  if (elements.compareBtn) {
    elements.compareBtn.addEventListener('click', compareReports);
  }
  elements.reportSelectA.addEventListener('change', () => {
    state.reportLocalAContent = null;
    state.reportLocalAName = '';
    if (elements.reportFileAName) {
      elements.reportFileAName.value = '';
    }
    maybeAutoCompareReports();
  });
  elements.reportSelectB.addEventListener('change', () => {
    state.reportLocalBContent = null;
    state.reportLocalBName = '';
    if (elements.reportFileBName) {
      elements.reportFileBName.value = '';
    }
    maybeAutoCompareReports();
  });
  elements.pdfBtn.addEventListener('click', generatePdf);
  elements.saveCalibrationBtn.addEventListener('click', saveCalibration);
  elements.saveSettingsBtn.addEventListener('click', saveSettings);
}

async function init() {
  wireEvents();
  setupCalibrationUnlock();
  setActiveView('home');
  setReportView(state.reportView);
  if (elements.reportFileA) {
    elements.reportFileA.classList.add('is-hidden');
  }
  if (elements.reportFileB) {
    elements.reportFileB.classList.add('is-hidden');
  }
  if (elements.reportFileAPicker) {
    elements.reportFileAPicker.classList.remove('is-hidden');
  }
  if (elements.reportFileBPicker) {
    elements.reportFileBPicker.classList.remove('is-hidden');
  }
  await refreshStatus();
  startStatusPolling();
  updateRawToggle();
  await refreshMeasurements();
  await refreshCalibration();
  await refreshSettings();
  await refreshSystemData();
  await refreshReportsList();
}

init();
