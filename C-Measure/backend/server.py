import json
import mimetypes
import os
import uuid
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from phidget_service import PhidgetService
from settings import load_settings, save_settings
from storage import Storage, default_data_dir


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
            return self._send_json({
                "connected": self.server.service.connected,
                "simulate": self.server.service.simulate,
                "statuses": self.server.service.get_statuses(),
            })
        if route == "/api/measurements":
            values = self.server.service.get_measurements()
            statuses = self.server.service.get_statuses()
            items = []
            for idx, value in enumerate(values):
                items.append({
                    "id": idx,
                    "status": statuses[idx] if idx < len(statuses) else "Unknown",
                    "value": value,
                    "unit": "N",
                })
            return self._send_json({"measurements": items})
        if route == "/api/calibration":
            return self._send_json({"calibration": self.server.service.calibration})
        if route == "/api/tests":
            return self._send_json({"files": self.server.storage.list_measurements()})
        if route == "/api/settings":
            return self._send_json({
                "dataDir": str(self.server.storage.data_dir),
                "simulate": self.server.service.simulate,
            })
        if route == "/api/system":
            return self._send_json(self.server.system_info)
        self.send_error(404)

    def _handle_api_post(self):
        route = urlparse(self.path).path
        if route == "/api/connect":
            self.server.service.connect()
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
            filename = self.server.service.record_measurement()
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
        if route == "/api/zero":
            self.server.service.zero_set()
            return self._send_json({"status": "ok"})
        self.send_error(404)

    def _handle_api_put(self):
        route = urlparse(self.path).path
        if route == "/api/calibration":
            payload = self._read_json()
            rows = payload.get("calibration")
            if not isinstance(rows, list):
                return self._send_json({"error": "Invalid calibration data"}, status=400)
            self.server.service.update_calibration(rows)
            self.server.update_pairing()
            return self._send_json({"calibration": self.server.service.calibration})
        if route == "/api/settings":
            payload = self._read_json()
            data_dir = payload.get("dataDir")
            simulate = payload.get("simulate")
            if data_dir:
                self.server.storage.set_data_dir(data_dir)
                self.server.service.storage = self.server.storage
                self.server.service.refresh_calibration()
            if simulate is not None:
                self.server.service._simulate = bool(simulate)
            settings = load_settings()
            settings["dataDir"] = str(self.server.storage.data_dir)
            settings["simulate"] = self.server.service.simulate
            save_settings(settings)
            return self._send_json({
                "dataDir": str(self.server.storage.data_dir),
                "simulate": self.server.service.simulate,
            })
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

    def update_pairing(self):
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
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


def main():
    settings = load_settings()
    data_dir = os.getenv("CMEASURE_DATA_DIR") or settings.get("dataDir") or default_data_dir()
    simulate_env = os.getenv("CMEASURE_SIMULATE")
    simulate = settings.get("simulate")
    if simulate_env is not None:
        simulate = simulate_env.lower() in ("1", "true", "yes")

    storage = Storage(data_dir)
    service = PhidgetService(storage, simulate=simulate)

    port = int(os.getenv("CMEASURE_PORT", "8123"))
    ui_dir = os.getenv("CMEASURE_UI_DIR") or str(Path(__file__).resolve().parent.parent / "frontend")

    server = CMeasureServer(("127.0.0.1", port), ApiHandler, storage, service, ui_dir)
    server.system_info = ensure_system_info()
    print(f"C-Measure backend running on http://127.0.0.1:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
