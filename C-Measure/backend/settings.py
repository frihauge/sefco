import json
import os
import sys
from pathlib import Path


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


SETTINGS_FILE = get_data_dir() / "settings.json"


def load_settings():
    if SETTINGS_FILE.exists():
        try:
            return json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
    return {}


def save_settings(settings):
    try:
        SETTINGS_FILE.write_text(json.dumps(settings, indent=2), encoding="utf-8")
    except OSError:
        return False
    return True
