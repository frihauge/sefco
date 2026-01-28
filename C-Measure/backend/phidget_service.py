import math
import os
import socket
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    from Phidget22.Devices.VoltageRatioInput import VoltageRatioInput
    from Phidget22.Net import Net, PhidgetServerType
    PHIDGET_AVAILABLE = True
except Exception:
    PHIDGET_AVAILABLE = False

from settings import load_settings


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
        settings = load_settings()
        self.calibration = self.storage.read_calibration(self.num_ids, serial=settings.get("systemSerial"))
        self.connected = False
        self.lock = threading.Lock()
        self._channels = []
        self._connect_lock = threading.Lock()
        self._connecting = False
        self._connect_thread = None
        self._connect_cancel = threading.Event()
        self._server_discovery_enabled = False
        self._remote_server_added = False
        self._remote_host = os.getenv("CMEASURE_PHIDGET_HOST", "192.168.100.1")
        self._remote_port = int(os.getenv("CMEASURE_PHIDGET_PORT", "5661"))
        self._remote_password = os.getenv("CMEASURE_PHIDGET_PASSWORD", "")
        self._remote_name = os.getenv("CMEASURE_PHIDGET_SERVER_NAME", "cmeasure-bridge")
        self._bridge_status = {
            "reachable": None,
            "error": None,
            "checkedAt": 0.0,
            "host": self._remote_host,
            "port": self._remote_port,
            "simulated": False,
        }
        self._bridge_check_interval = float(os.getenv("CMEASURE_BRIDGE_CHECK_INTERVAL", "2.0"))
        self._bridge_timeout = float(os.getenv("CMEASURE_BRIDGE_TIMEOUT", "0.8"))
        self._bridge_check_lock = threading.Lock()
        self._simulate = self._resolve_simulation(simulate)
        self._last_sim = time.time()

    def _resolve_simulation(self, simulate):
        if simulate is not None:
            return bool(simulate)
        return not PHIDGET_AVAILABLE

    @property
    def simulate(self):
        return self._simulate

    def connect(self, use_remote=True):
        if self._simulate:
            with self.lock:
                self.statuses = ["Connected" for _ in range(self.num_ids)]
                self.connected = True
            return

        with self.lock:
            fully_connected = self.connected and all(status == "Connected" for status in self.statuses)

        with self._connect_lock:
            if self._connecting or fully_connected:
                return
            self._connecting = True
            self._connect_cancel.clear()

        with self.lock:
            self.statuses = ["Connecting" for _ in range(self.num_ids)]
            self.connected = False

        self._connect_thread = threading.Thread(
            target=self._connect_worker,
            args=(use_remote,),
            daemon=True,
        )
        self._connect_thread.start()

    def disconnect(self):
        self._connect_cancel.set()
        connect_thread = self._connect_thread
        if connect_thread and connect_thread.is_alive():
            connect_thread.join(timeout=0.2)
        if self._simulate:
            with self.lock:
                self.statuses = ["Disconnected" for _ in range(self.num_ids)]
                self.connected = False
            return
        self._close_channels()
        with self.lock:
            self.statuses = ["Disconnected" for _ in range(self.num_ids)]
            self.connected = False

    def _on_attach(self, ph):
        if self._connect_cancel.is_set():
            return
        idx = getattr(ph, "channelIndex", None)
        if idx is None:
            return
        try:
            # Configure DataInterval - minimum time between VoltageRatioChange events (ms)
            ph.setDataInterval(1000)
            # Set VoltageRatioChangeTrigger to 0 to get all changes
            ph.setVoltageRatioChangeTrigger(0.0)
        except Exception:
            pass
        with self.lock:
            if 0 <= idx < self.num_ids:
                self.statuses[idx] = "Connected"

    def _on_error(self, ph, code, description):
        if self._connect_cancel.is_set():
            return
        idx = getattr(ph, "channelIndex", None)
        if idx is None:
            return
        print(f"[PhidgetService] Channel {idx} error: {description} (code {code})")
        with self.lock:
            if 0 <= idx < self.num_ids:
                self.statuses[idx] = "Disconnected"

    def _on_change(self, ph, sensor_value):
        idx = getattr(ph, "channelIndex", None)
        if idx is None:
            return
        with self.lock:
            if 0 <= idx < self.num_ids:
                self.raw_values[idx] = float(sensor_value)

    def refresh_calibration(self):
        settings = load_settings()
        self.calibration = self.storage.read_calibration(self.num_ids, serial=settings.get("systemSerial"))
        return self.calibration

    def update_calibration(self, rows, serial=None):
        self.calibration = rows
        self.storage.write_calibration(rows, serial=serial)

    def get_statuses(self):
        with self.lock:
            return list(self.statuses)

    def get_measurements(self):
        if self._simulate:
            self._simulate_values()
        with self.lock:
            raw_snapshot = list(self.raw_values)
            tare_offsets = list(self.zero_offsets)
        calibrated = self._apply_calibration_all(raw_snapshot)
        final = []
        for idx, value in enumerate(calibrated):
            tare = tare_offsets[idx] if idx < len(tare_offsets) else 0.0
            final.append(value - tare)
        with self.lock:
            self.values = final
        return final

    def get_raw_values(self):
        if self._simulate:
            self._simulate_values()
        with self.lock:
            return list(self.raw_values)

    def average_raw_all(self, samples=10, delay=0.05):
        if samples <= 0:
            return self.get_raw_values()
        sums = [0.0 for _ in range(self.num_ids)]
        for _ in range(samples):
            if self._connect_cancel.is_set():
                break
            if self._simulate:
                self._simulate_values()
            with self.lock:
                snapshot = list(self.raw_values)
            for idx, value in enumerate(snapshot):
                sums[idx] += float(value)
            time.sleep(delay)
        return [value / max(samples, 1) for value in sums]

    def average_raw_cell(self, idx, samples=100, delay=0.05):
        if idx < 0 or idx >= self.num_ids:
            raise ValueError("Invalid cell index")
        total = 0.0
        for _ in range(samples):
            if self._connect_cancel.is_set():
                break
            if self._simulate:
                self._simulate_values()
            with self.lock:
                total += float(self.raw_values[idx])
            time.sleep(delay)
        return total / max(samples, 1)

    def get_bridge_status(self):
        if self._simulate:
            return {
                "reachable": True,
                "error": None,
                "checkedAt": time.time(),
                "host": self._remote_host,
                "port": self._remote_port,
                "simulated": True,
            }
        now = time.time()
        with self._bridge_check_lock:
            cached = dict(self._bridge_status)
        if cached.get("checkedAt") and now - cached["checkedAt"] < self._bridge_check_interval:
            return cached
        reachable, error = self._probe_bridge()
        status = {
            "reachable": reachable,
            "error": error,
            "checkedAt": now,
            "host": self._remote_host,
            "port": self._remote_port,
            "simulated": False,
        }
        with self._bridge_check_lock:
            self._bridge_status = status
        return dict(status)

    def record_measurement(self, name=None):
        values = self.get_measurements()
        return self.storage.write_measurement(values, name=name)

    def zero_set(self):
        if self._simulate:
            self._simulate_values()
        with self.lock:
            raw_snapshot = list(self.raw_values)
        offsets = self._apply_calibration_all(raw_snapshot)
        with self.lock:
            self.zero_offsets = list(offsets)

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
                if self.connected:
                    self.statuses[idx] = "Connected"

    def _apply_calibration(self, idx, value):
        try:
            cal = self.calibration[idx]
            gain = float(cal.get("Gain", 1))
            offset = float(cal.get("Offset", 0))
        except (ValueError, IndexError, TypeError):
            gain = 1
            offset = 0
        return (value - offset) * gain

    def _apply_calibration_all(self, raw_values):
        calibrated = []
        for idx, value in enumerate(raw_values):
            calibrated.append(self._apply_calibration(idx, value))
        return calibrated

    def _probe_bridge(self):
        host = self._remote_host
        port = self._remote_port
        if not host:
            return False, "No host configured"
        try:
            with socket.create_connection((host, port), timeout=self._bridge_timeout):
                return True, None
        except Exception as e:
            return False, str(e)

    def _close_channels(self):
        with self.lock:
            channels = list(self._channels)
            self._channels = []
        for ph in channels:
            try:
                ph.close()
            except Exception:
                continue

    def _connect_worker(self, use_remote=True):
        try:
            self._close_channels()

            if use_remote:
                if not self._remote_server_added:
                    try:
                        Net.addServer(
                            self._remote_name,
                            self._remote_host,
                            self._remote_port,
                            self._remote_password,
                            0,
                        )
                        print(f"[PhidgetService] Remote server added: {self._remote_host}:{self._remote_port}")
                        self._remote_server_added = True
                    except Exception as e:
                        print(f"[PhidgetService] Remote server add failed: {e}")
                if not self._server_discovery_enabled:
                    try:
                        Net.enableServerDiscovery(PhidgetServerType.PHIDGETSERVER_DEVICEREMOTE)
                        print("[PhidgetService] Server discovery enabled for remote devices")
                        self._server_discovery_enabled = True
                    except Exception as e:
                        print(f"[PhidgetService] Server discovery failed: {e}")

            tasks = []
            index = -1

            def open_channel(idx, port, channel):
                if self._connect_cancel.is_set():
                    return
                ph = VoltageRatioInput()
                ph.setHubPort(port)
                ph.setIsHubPortDevice(0)
                ph.setChannel(channel)
                if use_remote:
                    ph.setIsRemote(True)
                ph.setOnAttachHandler(self._on_attach)
                ph.setOnVoltageRatioChangeHandler(self._on_change)
                ph.setOnErrorHandler(self._on_error)
                ph.channelIndex = idx
                with self.lock:
                    self.statuses[idx] = "Connecting"
                try:
                    ph.openWaitForAttachment(2000)
                    if self._connect_cancel.is_set():
                        try:
                            ph.close()
                        except Exception:
                            pass
                        return
                    with self.lock:
                        self._channels.append(ph)
                        if self.statuses[idx] == "Connecting":
                            self.statuses[idx] = "Connected"
                except Exception as e:
                    print(f"[PhidgetService] Channel {idx} error: {e}")
                    with self.lock:
                        self.statuses[idx] = "Disconnected"
                    try:
                        ph.close()
                    except Exception:
                        pass

            with ThreadPoolExecutor(max_workers=self.num_ids or 1) as executor:
                for port in range(self.num_ports):
                    for channel in range(self.num_channels):
                        index += 1
                        if self._connect_cancel.is_set():
                            return
                        tasks.append(executor.submit(open_channel, index, port, channel))
                for future in as_completed(tasks):
                    if self._connect_cancel.is_set():
                        return
                    _ = future.result()
        finally:
            with self.lock:
                self.connected = any(status == "Connected" for status in self.statuses)
                if self._connect_cancel.is_set() and not self.connected:
                    self.statuses = ["Disconnected" for _ in range(self.num_ids)]
            with self._connect_lock:
                self._connecting = False
