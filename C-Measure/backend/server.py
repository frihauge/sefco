import json
import logging
import mimetypes
import os
import re
import subprocess
import sys
import tempfile
import threading
import uuid
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from xml.sax.saxutils import escape as xml_escape

from phidget_service import PhidgetService
from settings import load_settings, save_settings, get_data_dir
from storage import Storage, default_data_dir

# Minimal logging - only errors to console
logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger('CMeasure')


class ApiHandler(BaseHTTPRequestHandler):
    server_version = "CMeasureHTTP/0.1"

    def do_GET(self):
        if self.path.startswith("/api/"):
            self._handle_api_get()
        else:
            self._serve_static()

    def do_POST(self):
        if self.path.startswith("/api/"):
            self._handle_api_post()
        else:
            self.send_error(404)

    def do_PUT(self):
        if self.path.startswith("/api/"):
            self._handle_api_put()
        else:
            self.send_error(404)

    def _handle_api_get(self):
        route = urlparse(self.path).path
        if route == "/api/health":
            return self._send_json({"status": "ok"})
        if route == "/api/status":
            bridge = self.server.service.get_bridge_status()
            statuses = self.server.service.get_statuses()
            connected = self.server.service.connected
            if bridge and not bridge.get("simulated") and bridge.get("reachable") is False:
                statuses = ["Disconnected" for _ in statuses]
                connected = False
            return self._send_json({
                "connected": connected,
                "simulate": self.server.service.simulate,
                "statuses": statuses,
                "bridge": bridge,
                "calibrationMissing": self.server.storage.calibration_missing,
            })
        if route == "/api/measurements":
            values = self.server.service.get_measurements()
            raw_values = self.server.service.get_raw_values()
            statuses = self.server.service.get_statuses()
            bridge = self.server.service.get_bridge_status()
            if bridge and not bridge.get("simulated") and bridge.get("reachable") is False:
                statuses = ["Disconnected" for _ in statuses]
            items = []
            for idx, value in enumerate(values):
                items.append({
                    "id": idx,
                    "status": statuses[idx] if idx < len(statuses) else "Unknown",
                    "value": value,
                    "raw": raw_values[idx] if idx < len(raw_values) else None,
                    "unit": "N",
                })
            return self._send_json({"measurements": items})
        if route == "/api/calibration":
            settings = load_settings()
            return self._send_json({
                "calibration": self.server.service.calibration,
                "serial": settings.get("systemSerial"),
            })
        if route == "/api/tests":
            return self._send_json({"files": self.server.storage.list_measurements()})
        if route == "/api/settings":
            return self._send_json({
                "dataDir": str(self.server.storage.data_dir),
                "simulate": self.server.service.simulate,
                "plotMaxX": load_settings().get("plotMaxX"),
            })
        if route == "/api/system":
            settings = load_settings()
            info = dict(self.server.system_info)
            info["wifiSsid"] = settings.get("wifiSsid")
            info["lastCalibrationAt"] = self.server.storage.calibration_timestamp
            return self._send_json(info)
        if route == "/api/wifi/networks":
            items, code, output = list_wifi_networks()
            if code != 0:
                return self._send_json({"error": "Failed to list wifi", "detail": output}, status=500)
            return self._send_json({"networks": items})
        self.send_error(404)

    def _handle_api_post(self):
        route = urlparse(self.path).path
        logger.debug(f"POST request: {route}")
        if route == "/api/connect":
            logger.info("Connect request received")
            self.server.service.connect()
            logger.info(f"Connect result: connected={self.server.service.connected}")
            return self._send_json({
                "connected": self.server.service.connected,
                "statuses": self.server.service.get_statuses(),
            })
        if route == "/api/disconnect":
            self.server.service.disconnect()
            return self._send_json({
                "connected": self.server.service.connected,
                "statuses": self.server.service.get_statuses(),
            })
        if route == "/api/measurements":
            payload = self._read_json()
            name = payload.get("name") if isinstance(payload, dict) else None
            filename = self.server.service.record_measurement(name=name)
            return self._send_json({"file": filename})
        if route == "/api/reports/compare":
            payload = self._read_json()
            file_a = payload.get("fileA")
            file_b = payload.get("fileB")
            data_a = self.server.storage.read_measurement(file_a) if file_a else []
            data_b = self.server.storage.read_measurement(file_b) if file_b else []
            size = max(len(data_a), len(data_b))
            heights = [15 * (i + 1) for i in range(size)]
            return self._send_json({
                "fileA": file_a,
                "fileB": file_b,
                "heightsCm": heights,
                "valuesA": data_a,
                "valuesB": data_b,
            })
        if route == "/api/reports/single":
            payload = self._read_json()
            file_name = payload.get("file")
            data = self.server.storage.read_measurement(file_name) if file_name else []
            heights = [15 * (i + 1) for i in range(len(data))]
            return self._send_json({
                "file": file_name,
                "heightsCm": heights,
                "values": data,
            })
        if route == "/api/zero":
            self.server.service.zero_set()
            return self._send_json({"status": "ok"})
        if route == "/api/calibration/zero":
            rows = self.server.service.calibration
            offsets = self.server.service.average_raw_all(samples=10, delay=1.0)
            updated = []
            for idx, row in enumerate(rows):
                updated.append({
                    "LoadCell": str(idx),
                    "Offset": str(offsets[idx] if idx < len(offsets) else 0),
                    "Gain": row.get("Gain", "1"),
                })
            settings = load_settings()
            serial = settings.get("systemSerial")
            self.server.service.update_calibration(updated, serial=serial)
            return self._send_json({"calibration": self.server.service.calibration})
        if route == "/api/calibration/gain":
            payload = self._read_json()
            try:
                cell_index = int(payload.get("cell"))
            except (TypeError, ValueError):
                return self._send_json({"error": "Invalid cell index"}, status=400)
            try:
                weight = float(payload.get("weight"))
            except (TypeError, ValueError):
                return self._send_json({"error": "Invalid weight"}, status=400)
            statuses = self.server.service.get_statuses()
            if cell_index < 0 or cell_index >= len(statuses):
                return self._send_json({"error": "Invalid cell index"}, status=400)
            if statuses[cell_index] != "Connected":
                return self._send_json({"error": "Cell not connected"}, status=400)
            avg_raw = self.server.service.average_raw_cell(cell_index, samples=100, delay=0.05)
            rows = list(self.server.service.calibration)
            try:
                offset = float(rows[cell_index].get("Offset", 0))
            except (TypeError, ValueError):
                offset = 0.0
            denom = avg_raw - offset
            if denom == 0:
                return self._send_json({"error": "Invalid gain (zero delta)"}, status=400)
            gain = weight / denom
            rows[cell_index] = {
                "LoadCell": str(cell_index),
                "Offset": str(offset),
                "Gain": str(gain),
            }
            settings = load_settings()
            serial = settings.get("systemSerial")
            self.server.service.update_calibration(rows, serial=serial)
            return self._send_json({"calibration": self.server.service.calibration, "cell": cell_index})
        self.send_error(404)

    def _handle_api_put(self):
        route = urlparse(self.path).path
        if route == "/api/calibration":
            payload = self._read_json()
            rows = payload.get("calibration")
            if not isinstance(rows, list):
                return self._send_json({"error": "Invalid calibration data"}, status=400)
            settings = load_settings()
            serial = settings.get("systemSerial")
            self.server.service.update_calibration(rows, serial=serial)
            self.server.update_pairing(calibrated_at=self.server.storage.calibration_timestamp)
            return self._send_json({"calibration": self.server.service.calibration})
        if route == "/api/settings":
            payload = self._read_json()
            data_dir = payload.get("dataDir")
            simulate = payload.get("simulate")
            plot_max_x = payload.get("plotMaxX") if isinstance(payload, dict) else None
            if data_dir:
                self.server.storage.set_data_dir(data_dir)
                self.server.service.storage = self.server.storage
                self.server.service.refresh_calibration()
            if simulate is not None:
                self.server.service._simulate = bool(simulate)
            settings = load_settings()
            settings["dataDir"] = str(self.server.storage.data_dir)
            settings["simulate"] = self.server.service.simulate
            if plot_max_x is None or plot_max_x == "":
                settings.pop("plotMaxX", None)
            else:
                try:
                    settings["plotMaxX"] = float(plot_max_x)
                except (TypeError, ValueError):
                    settings.pop("plotMaxX", None)
            save_settings(settings)
            return self._send_json({
                "dataDir": str(self.server.storage.data_dir),
                "simulate": self.server.service.simulate,
                "plotMaxX": settings.get("plotMaxX"),
            })
        if route == "/api/system/serial":
            payload = self._read_json()
            serial = payload.get("serial")
            if not serial:
                return self._send_json({"error": "Serial is required"}, status=400)
            settings = load_settings()
            settings["systemSerial"] = str(serial)
            save_settings(settings)
            self.server.system_info["systemSerial"] = str(serial)
            self.server.service.refresh_calibration()
            return self._send_json(self.server.system_info)
        if route == "/api/system/wifi":
            payload = self._read_json()
            ssid = payload.get("ssid")
            password = payload.get("password")
            if not ssid:
                return self._send_json({"error": "SSID is required"}, status=400)
            settings = load_settings()
            settings["wifiSsid"] = str(ssid)
            settings["wifiPassword"] = str(password or "")
            save_settings(settings)
            info = dict(self.server.system_info)
            info["wifiSsid"] = settings.get("wifiSsid")
            return self._send_json(info)
        if route == "/api/wifi/connect":
            payload = self._read_json()
            ssid = payload.get("ssid")
            password = payload.get("password") if isinstance(payload, dict) else None
            ok, output = connect_wifi(ssid, password=password)
            if not ok:
                return self._send_json({"error": "Failed to connect", "detail": output}, status=400)
            settings = load_settings()
            settings["wifiSsid"] = str(ssid)
            settings["wifiPassword"] = str(password or "")
            save_settings(settings)
            return self._send_json({"status": "ok"})
        self.send_error(404)

    def _serve_static(self):
        ui_dir = Path(self.server.ui_dir)
        path = urlparse(self.path).path
        rel_path = path.lstrip("/") or "index.html"
        fs_path = ui_dir / rel_path
        if not fs_path.exists() or not fs_path.is_file():
            fs_path = ui_dir / "index.html"
        try:
            content = fs_path.read_bytes()
        except OSError:
            self.send_error(404)
            return
        mime_type, _ = mimetypes.guess_type(str(fs_path))
        self.send_response(200)
        self.send_header("Content-Type", mime_type or "application/octet-stream")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(content)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        data = self.rfile.read(length)
        try:
            return json.loads(data.decode("utf-8"))
        except json.JSONDecodeError:
            return {}

    def _send_json(self, payload, status=200):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)


class CMeasureServer(ThreadingHTTPServer):
    def __init__(self, server_address, RequestHandlerClass, storage, service, ui_dir):
        super().__init__(server_address, RequestHandlerClass)
        self.storage = storage
        self.service = service
        self.ui_dir = ui_dir
        self.system_info = {}

    def update_pairing(self, calibrated_at=None):
        now = calibrated_at or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        self.system_info["pairedSerial"] = new_pairing_serial()
        self.system_info["lastCalibrationAt"] = now
        settings = load_settings()
        settings.update(self.system_info)
        save_settings(settings)


def new_pairing_serial():
    return uuid.uuid4().hex[:12].upper()


def ensure_system_info():
    settings = load_settings()
    if not settings.get("systemSerial"):
        settings["systemSerial"] = uuid.uuid4().hex[:12].upper()
        save_settings(settings)
    return {
        "systemSerial": settings.get("systemSerial"),
        "pairedSerial": settings.get("pairedSerial"),
        "lastCalibrationAt": settings.get("lastCalibrationAt"),
    }


def _run_netsh(args):
    result = subprocess.run(
        ["netsh"] + args,
        capture_output=True,
        text=True,
        shell=False,
    )
    output = (result.stdout or "") + (result.stderr or "")
    return result.returncode, output


def list_wifi_networks():
    code, output = _run_netsh(["wlan", "show", "networks", "mode=bssid"])
    networks = {}
    current = None
    for line in output.splitlines():
        ssid_match = re.match(r"\s*SSID\s+\d+\s*:\s*(.*)", line, re.IGNORECASE)
        if ssid_match:
            name = ssid_match.group(1).strip()
            if not name:
                current = None
                continue
            current = name
            if name not in networks:
                networks[name] = {"ssid": name, "signal": None}
            continue
        if current:
            signal_match = re.match(r"\s*Signal\s*:\s*(\d+)%", line, re.IGNORECASE)
            if signal_match:
                value = int(signal_match.group(1))
                if networks[current]["signal"] is None or value > networks[current]["signal"]:
                    networks[current]["signal"] = value
    items = list(networks.values())
    items.sort(key=lambda item: item["signal"] or 0, reverse=True)
    return items, code, output


def _wifi_profile_xml(ssid, password=None):
    name = xml_escape(ssid)
    if password:
        key = xml_escape(password)
        return f"""<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
  <name>{name}</name>
  <SSIDConfig>
    <SSID>
      <name>{name}</name>
    </SSID>
  </SSIDConfig>
  <connectionType>ESS</connectionType>
  <connectionMode>auto</connectionMode>
  <MSM>
    <security>
      <authEncryption>
        <authentication>WPA2PSK</authentication>
        <encryption>AES</encryption>
        <useOneX>false</useOneX>
      </authEncryption>
      <sharedKey>
        <keyType>passPhrase</keyType>
        <protected>false</protected>
        <keyMaterial>{key}</keyMaterial>
      </sharedKey>
    </security>
  </MSM>
</WLANProfile>
"""
    return f"""<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
  <name>{name}</name>
  <SSIDConfig>
    <SSID>
      <name>{name}</name>
    </SSID>
  </SSIDConfig>
  <connectionType>ESS</connectionType>
  <connectionMode>auto</connectionMode>
  <MSM>
    <security>
      <authEncryption>
        <authentication>open</authentication>
        <encryption>none</encryption>
        <useOneX>false</useOneX>
      </authEncryption>
    </security>
  </MSM>
</WLANProfile>
"""


def connect_wifi(ssid, password=None):
    if not ssid:
        return False, "SSID is required"
    code, output = _run_netsh(["wlan", "connect", f"name={ssid}", f"ssid={ssid}"])
    if code == 0:
        return True, output
    profile_xml = _wifi_profile_xml(ssid, password=password or None)
    with tempfile.NamedTemporaryFile("w", suffix=".xml", delete=False) as handle:
        handle.write(profile_xml)
        profile_path = handle.name
    try:
        _run_netsh(["wlan", "add", "profile", f"filename={profile_path}", "user=all"])
    finally:
        try:
            os.remove(profile_path)
        except OSError:
            pass
    code, output = _run_netsh(["wlan", "connect", f"name={ssid}", f"ssid={ssid}"])
    return code == 0, output


def auto_connect_wifi(settings):
    ssid = settings.get("wifiSsid")
    if not ssid:
        return
    password = settings.get("wifiPassword")
    ok, output = connect_wifi(ssid, password=password)
    if ok:
        print(f"[WiFi] Auto-connected to {ssid}")
    else:
        print(f"[WiFi] Auto-connect failed for {ssid}: {output}")


def main():
    logger.info("=" * 60)
    logger.info("C-Measure Backend Starting")
    logger.info("=" * 60)

    settings = load_settings()
    system_info = ensure_system_info()
    settings = load_settings()
    data_dir = os.getenv("CMEASURE_DATA_DIR") or settings.get("dataDir") or default_data_dir()
    simulate_env = os.getenv("CMEASURE_SIMULATE")
    simulate = settings.get("simulate")
    if simulate_env is not None:
        simulate = simulate_env.lower() in ("1", "true", "yes")

    logger.info(f"Data directory: {data_dir}")
    logger.info(f"Simulation mode: {simulate}")

    storage = Storage(data_dir)
    # Default: 6 ports x 2 channels = 12 sensors (same as WrapView)
    num_ports = int(settings.get("numPorts", 6))
    num_channels = int(settings.get("numChannels", 2))
    logger.info(f"Ports: {num_ports}, Channels per port: {num_channels}")

    service = PhidgetService(storage, num_ports=num_ports, num_channels=num_channels, simulate=simulate)

    port = int(os.getenv("CMEASURE_PORT", "8123"))
    ui_dir = os.getenv("CMEASURE_UI_DIR") or str(Path(__file__).resolve().parent.parent / "frontend")

    server = CMeasureServer(("127.0.0.1", port), ApiHandler, storage, service, ui_dir)
    server.system_info = system_info
    if storage.calibration_timestamp:
        server.system_info["lastCalibrationAt"] = storage.calibration_timestamp
    threading.Thread(target=auto_connect_wifi, args=(settings,), daemon=True).start()
    logger.info(f"C-Measure backend running on http://127.0.0.1:{port}")
    print(f"C-Measure backend running on http://127.0.0.1:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down (keyboard interrupt)")
    finally:
        logger.info("Server shutdown")
        server.shutdown()


if __name__ == "__main__":
    main()
