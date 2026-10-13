import os
from pathlib import Path
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DEFAULT_DATA_DIR = BASE_DIR / "data"
DEFAULT_STAGING_DIR = DEFAULT_DATA_DIR / "staging"
DEFAULT_EXPORT_DIR = DEFAULT_DATA_DIR / "export"
SETTINGS_FILE = DEFAULT_DATA_DIR / "settings.json"

DEFAULT_STAGING_DIR.mkdir(parents=True, exist_ok=True)
DEFAULT_EXPORT_DIR.mkdir(parents=True, exist_ok=True)

APP_VERSION = "0.9.5-rc1"

class AppSettings(BaseModel):
    export_directory: str = str(DEFAULT_EXPORT_DIR)
    default_compression: str = "original" # original, webp, jpg
    default_quality: int = 80
    komga_server_url: str = ""
    komga_api_key: str = ""
    clean_junk_files: bool = True
    split_max_height: int = 2500 # Webtoon slicer default max height
    show_system_monitor: bool = False
    donation_url: str = "https://www.paypal.com/donate/?hosted_button_id=K2L2FEZ2NS6TY"

def load_settings() -> AppSettings:
    if SETTINGS_FILE.exists():
        try:
            import json
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return AppSettings(**data)
        except Exception:
            pass
    return AppSettings()

def save_settings(settings: AppSettings):
    import json
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(settings.model_dump(), f, indent=2, ensure_ascii=False)
