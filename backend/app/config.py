import os
from pathlib import Path
from pydantic import BaseModel

def get_base_dir() -> Path:
    cur = Path(__file__).resolve()
    # In Docker: /app/app/config.py -> parent.parent is /app
    if cur.parent.parent == Path("/app"):
        return Path("/app")
    return cur.parent.parent.parent

BASE_DIR = get_base_dir()

def get_default_data_dir() -> Path:
    if os.environ.get("DATA_DIR"):
        return Path(os.environ["DATA_DIR"])
    # If in Docker or /app/data exists
    app_data = Path("/app/data")
    if app_data.exists() or Path("/app").is_dir():
        return app_data
    return BASE_DIR / "data"

DEFAULT_DATA_DIR = get_default_data_dir()
DEFAULT_STAGING_DIR = Path(os.environ.get("STAGING_DIR", str(DEFAULT_DATA_DIR / "staging")))
DEFAULT_EXPORT_DIR = Path(os.environ.get("EXPORT_DIR", str(DEFAULT_DATA_DIR / "export")))
SETTINGS_FILE = DEFAULT_DATA_DIR / "settings.json"

DEFAULT_DATA_DIR.mkdir(parents=True, exist_ok=True)
DEFAULT_STAGING_DIR.mkdir(parents=True, exist_ok=True)
DEFAULT_EXPORT_DIR.mkdir(parents=True, exist_ok=True)

APP_VERSION = "0.9.5-rc1"

class AppSettings(BaseModel):
    export_directory: str = str(DEFAULT_EXPORT_DIR)
    staging_directory: str = str(DEFAULT_STAGING_DIR)
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
                if not data.get("staging_directory"):
                    data["staging_directory"] = str(DEFAULT_STAGING_DIR)
                return AppSettings(**data)
        except Exception:
            pass
    return AppSettings()

def save_settings(settings: AppSettings):
    import json
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(settings.model_dump(), f, indent=2, ensure_ascii=False)
