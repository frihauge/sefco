import csv
import os
from pathlib import Path
from datetime import datetime

class Storage:
    def __init__(self, data_dir):
        self.set_data_dir(data_dir)

    def set_data_dir(self, data_dir):
        self.data_dir = Path(data_dir).resolve()
        self.measurements_dir = self.data_dir / "measurements"
        self.calibration_file = self.data_dir / "caldata.csv"
        self._ensure_dirs()

    def _ensure_dirs(self):
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.measurements_dir.mkdir(parents=True, exist_ok=True)

    def read_calibration(self, count):
        if not self.calibration_file.exists():
            self._write_default_calibration(count)
        rows = [self._default_row(i) for i in range(count)]
        try:
            with self.calibration_file.open("r", newline="") as handle:
                reader = csv.DictReader(handle)
                for row in reader:
                    try:
                        idx = int(row.get("LoadCell", -1))
                    except ValueError:
                        continue
                    if 0 <= idx < count:
                        rows[idx] = {
                            "LoadCell": str(idx),
                            "Multiplier": row.get("Multiplier", "1"),
                            "Addend": row.get("Addend", "0"),
                        }
        except OSError:
            return rows
        return rows

    def write_calibration(self, rows):
        self._ensure_dirs()
        with self.calibration_file.open("w", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=["LoadCell", "Multiplier", "Addend"])
            writer.writeheader()
            writer.writerows(rows)

    def write_measurement(self, values):
        self._ensure_dirs()
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
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

    def _write_default_calibration(self, count):
        rows = [self._default_row(i) for i in range(count)]
        self.write_calibration(rows)

    def _default_row(self, idx):
        return {"LoadCell": str(idx), "Multiplier": "1", "Addend": "0"}


def default_data_dir():
    env_dir = os.getenv("CMEASURE_DATA_DIR")
    if env_dir:
        return env_dir
    return str(Path(__file__).resolve().parent / "data")
