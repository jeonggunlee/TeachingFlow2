import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

STORAGE_ROOT   = Path(os.getenv("STORAGE_ROOT", "storage"))
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin")
DB_URL         = f"sqlite+aiosqlite:///{STORAGE_ROOT / 'db.sqlite3'}"

# createLecture 저장소 경로 (기본값: 같은 EDUTECH-3 루트 기준)
_default_cl = Path(__file__).parent.parent.parent / "createLecture" / "storage"
CREATELECTURE_STORAGE_ROOT = Path(os.getenv("CREATELECTURE_STORAGE_ROOT", str(_default_cl)))
