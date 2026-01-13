import math
import threading
import time

try:
    from Phidget22.Devices.VoltageRatioInput import VoltageRatioInput
    from Phidget22.Net import Net, PhidgetServerType
    PHIDGET_AVAILABLE = True
except Exception:
    PHIDGET_AVAILABLE = False


class PhidgetService:
    def __init__(self, storage, num_ports=6, num_channels=2, simulate=None):
        self.storage = storage
        self.num_ports = num_ports
        self.num_channels = num_channels
        self.num_ids = num_ports * num_channels
        self.raw_values = [0.0 for _ in range(self.num_ids)]
        self.values = [0.0 for _ in range(self.num_ids)]
        self.zero_offsets = [0.0 for _ in range(self.num_ids)]
        self.statuses = ["Disconnected" for _ in range(self.num_ids)]
        self.calibration = self.storage.read_calibration(self.num_ids)
        self.connected = False
        self.lock = threading.Lock()
        self._channels = []
        self._simulate = self._resolve_simulation(simulate)
        self._last_sim = time.time()

    def _resolve_simulation(self, simulate):
        if simulate is not None:
            return bool(simulate)
        return not PHIDGET_AVAILABLE

    @property
    def simulate(self):
        return self._simulate

    def connect(self):
        if self.connected:
            return
        if self._simulate:
            with self.lock:
                self.statuses = ["Connected" for _ in range(self.num_ids)]
                self.connected = True
            return
        self._channels = []
        try:
            Net.enableServerDiscovery(PhidgetServerType.PHIDGETSERVER_DEVICEREMOTE)
        except Exception:
            pass
        index = -1
        for port in range(self.num_ports):
            for channel in range(self.num_channels):
                index += 1
                try:
                    ph = VoltageRatioInput()
                    ph.setHubPort(port)
                    ph.setIsHubPortDevice(0)
                    ph.setChannel(channel)
                    ph.setIsRemote(True)
                    ph.setOnAttachHandler(self._on_attach)
                    ph.setOnVoltageRatioChangeHandler(self._on_change)
                    ph.setOnErrorHandler(self._on_error)
                    ph.channelIndex = index
                    self._channels.append(ph)
                    self.statuses[index] = "Connecting"
                    ph.openWaitForAttachment(2000)
                except Exception:
                    self.statuses[index] = "Error"
        self.connected = True

    def disconnect(self):
        if self._simulate:
            with self.lock:
                self.statuses = ["Disconnected" for _ in range(self.num_ids)]
                self.connected = False
            return
        for ph in self._channels:
            try:
                ph.close()
            except Exception:
                continue
        self._channels = []
        with self.lock:
            self.statuses = ["Disconnected" for _ in range(self.num_ids)]
            self.connected = False

    def _on_attach(self, ph):
        idx = getattr(ph, "channelIndex", None)
        if idx is None:
            return
        with self.lock:
            if 0 <= idx < self.num_ids:
                self.statuses[idx] = "Connected"

    def _on_error(self, ph, code, description):
        idx = getattr(ph, "channelIndex", None)
        if idx is None:
            return
        with self.lock:
            if 0 <= idx < self.num_ids:
                self.statuses[idx] = f"Error: {description}"

    def _on_change(self, ph, sensor_value):
        idx = getattr(ph, "channelIndex", None)
        if idx is None:
            return
        with self.lock:
            if 0 <= idx < self.num_ids:
                self.raw_values[idx] = float(sensor_value)

    def refresh_calibration(self):
        self.calibration = self.storage.read_calibration(self.num_ids)

    def update_calibration(self, rows):
        self.calibration = rows
        self.storage.write_calibration(rows)

    def get_statuses(self):
        with self.lock:
            return list(self.statuses)

    def get_measurements(self):
        if self._simulate:
            self._simulate_values()
        with self.lock:
            adjusted = [v - self.zero_offsets[i] for i, v in enumerate(self.raw_values)]
            calibrated = [self._apply_calibration(i, v) for i, v in enumerate(adjusted)]
            self.values = calibrated
            return calibrated

    def record_measurement(self):
        values = self.get_measurements()
        return self.storage.write_measurement(values)

    def zero_set(self):
        with self.lock:
            self.zero_offsets = list(self.raw_values)

    def _simulate_values(self):
        now = time.time()
        delta = max(now - self._last_sim, 0.1)
        self._last_sim = now
        phase = now * 0.7
        with self.lock:
            for idx in range(self.num_ids):
                wave = math.sin(phase + idx * 0.4)
                drift = math.cos((phase + idx) * 0.3) * 0.15
                base = (wave + 1.5) * 8 + idx * 0.2
                self.raw_values[idx] = max(base + drift * delta * 10, 0)
                self.statuses[idx] = "Connected"

    def _apply_calibration(self, idx, value):
        try:
            cal = self.calibration[idx]
            mult = float(cal.get("Multiplier", 1))
            add = float(cal.get("Addend", 0))
        except (ValueError, IndexError, TypeError):
            mult = 1
            add = 0
        return value * mult + add
