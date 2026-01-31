import csv
import os
import sys
from pathlib import Path
from datetime import datetime


def get_app_dir():
    """Get the application directory - works for both script and frozen exe."""
    if getattr(sys, 'frozen', False):
        # Running as compiled exe (PyInstaller)
        return Path(sys.executable).resolve().parent
    else:
        # Running as script
        return Path(__file__).resolve().parent


def get_data_dir():
    """Get writable data directory - uses AppData on Windows when installed."""
    if getattr(sys, 'frozen', False):
        # Running as compiled exe - use AppData for writable storage
        if sys.platform == 'win32':
            appdata = os.environ.get('APPDATA', '')
            if appdata:
                data_dir = Path(appdata) / 'C-Measure'
                data_dir.mkdir(parents=True, exist_ok=True)
                return data_dir
        # Fallback to exe directory
        return get_app_dir()
    else:
        # Running as script - use script directory
        return Path(__file__).resolve().parent

class Storage:
    def __init__(self, data_dir):
        self.calibration_missing = True
        self.calibration_timestamp = None
        self.set_data_dir(data_dir)

    def set_data_dir(self, data_dir):
        self.data_dir = Path(data_dir).resolve()
        self.measurements_dir = self.data_dir / "measurements"
        self._ensure_dirs()

    def _ensure_dirs(self):
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.measurements_dir.mkdir(parents=True, exist_ok=True)

    def _calibration_path(self, serial=None):
        if serial:
            return self.data_dir / f"caldata_{serial}.csv"
        return self.data_dir / "caldata.csv"

    def read_calibration(self, count, serial=None):
        path = self._calibration_path(serial)
        if not path.exists():
            self.calibration_missing = True
            self.calibration_timestamp = None
            return [self._default_row(i) for i in range(count)]
        self.calibration_missing = False
        self.calibration_timestamp = None
        rows = [self._default_row(i) for i in range(count)]
        try:
            with path.open("r", newline="") as handle:
                reader = csv.DictReader(handle)
                for row in reader:
                    if self.calibration_timestamp is None:
                        self.calibration_timestamp = row.get("CalibratedAt") or None
                    try:
                        idx = int(row.get("LoadCell", -1))
                    except ValueError:
                        continue
                    if 0 <= idx < count:
                        offset = row.get("Offset")
                        gain = row.get("Gain")
                        if offset is None and gain is None:
                            mult = row.get("Multiplier", "1")
                            add = row.get("Addend", "0")
                            try:
                                mult_val = float(mult)
                            except (TypeError, ValueError):
                                mult_val = 1.0
                            try:
                                add_val = float(add)
                            except (TypeError, ValueError):
                                add_val = 0.0
                            if mult_val == 0:
                                offset_val = 0.0
                            else:
                                offset_val = -add_val / mult_val
                            offset = str(offset_val)
                            gain = str(mult_val)
                        rows[idx] = {
                            "LoadCell": str(idx),
                            "Offset": str(offset if offset is not None else 0),
                            "Gain": str(gain if gain is not None else 1),
                        }
        except OSError:
            return rows
        return rows

    def write_calibration(self, rows, serial=None):
        self._ensure_dirs()
        path = self._calibration_path(serial)
        calibrated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with path.open("w", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=["LoadCell", "Offset", "Gain", "CalibratedAt"])
            writer.writeheader()
            for row in rows:
                writer.writerow({
                    "LoadCell": row.get("LoadCell"),
                    "Offset": row.get("Offset", "0"),
                    "Gain": row.get("Gain", "1"),
                    "CalibratedAt": calibrated_at,
                })
        self.calibration_missing = False
        self.calibration_timestamp = calibrated_at

    def write_measurement(self, values, name=None):
        self._ensure_dirs()
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        safe_name = self._sanitize_name(name)
        if safe_name:
            filename = f"Data_{timestamp}_{safe_name}.csv"
        else:
            filename = f"Data_{timestamp}.csv"
        filepath = self.measurements_dir / filename
        with filepath.open("w", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=["LoadCell", "MeasuredValue"])
            writer.writeheader()
            for idx, value in enumerate(values):
                writer.writerow({"LoadCell": idx, "MeasuredValue": value})
        return filename

    def list_measurements(self):
        if not self.measurements_dir.exists():
            return []
        files = [p.name for p in self.measurements_dir.glob("Data_*.csv") if p.is_file()]
        return sorted(files)

    def read_measurement(self, filename):
        filepath = self.measurements_dir / filename
        if not filepath.exists():
            return []
        values = {}
        with filepath.open("r", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                try:
                    idx = int(row.get("LoadCell", -1))
                    value = float(row.get("MeasuredValue", 0))
                except ValueError:
                    continue
                values[idx] = value
        if not values:
            return []
        max_idx = max(values.keys())
        return [values.get(i, 0.0) for i in range(max_idx + 1)]

    def _write_default_calibration(self, count, serial=None):
        rows = [self._default_row(i) for i in range(count)]
        self.write_calibration(rows, serial=serial)

    def _default_row(self, idx):
        return {"LoadCell": str(idx), "Offset": "0", "Gain": "1"}

    def _sanitize_name(self, name):
        if not name:
            return ""
        cleaned = []
        for ch in str(name).strip():
            if ch.isascii() and (ch.isalnum() or ch in ("-", "_")):
                cleaned.append(ch)
            elif ch.isspace():
                cleaned.append("_")
            else:
                cleaned.append("_")
        safe = "".join(cleaned).strip("_")
        return safe[:40]


def default_data_dir():
    env_dir = os.getenv("CMEASURE_DATA_DIR")
    if env_dir:
        return env_dir
    return str(get_data_dir() / "data")
