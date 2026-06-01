from datetime import datetime
from pathlib import Path
from uuid import uuid4

from app.config import settings


def new_lecture_id() -> str:
    return f"{datetime.now().strftime('%Y-%m-%d')}_{uuid4().hex[:8]}"


def lecture_dir(lecture_id: str) -> Path:
    return settings.storage_root / "lectures" / lecture_id


def ensure_lecture_dirs(lecture_id: str) -> Path:
    base = lecture_dir(lecture_id)
    (base / "slides").mkdir(parents=True, exist_ok=True)
    (base / "audio").mkdir(parents=True, exist_ok=True)
    return base


def lecture_id_from_path(base: Path) -> str:
    return base.name
