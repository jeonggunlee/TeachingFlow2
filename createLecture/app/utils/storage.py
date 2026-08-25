import json
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


# ── 강의 계보(lineage) ────────────────────────────────────────────────
# CQI로 진화한 버전들은 같은 lineage_id를 공유한다.
#   v1(root): lineage_id == 자기 lecture_id, version 1, parent 없음
#   v2:       lineage_id == v1의 lineage_id, version 2, parent == v1

def read_meta(lecture_id_or_dir) -> dict:
    base = (lecture_id_or_dir if isinstance(lecture_id_or_dir, Path)
            else lecture_dir(lecture_id_or_dir))
    p = base / "meta.json"
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {}


def write_meta(lecture_id_or_dir, meta: dict) -> dict:
    base = (lecture_id_or_dir if isinstance(lecture_id_or_dir, Path)
            else lecture_dir(lecture_id_or_dir))
    (base / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8",
    )
    return meta


def lineage_of(lecture_id: str) -> str:
    """이 강의가 속한 계보 id (없으면 자기 자신이 루트)."""
    return read_meta(lecture_id).get("lineage_id") or lecture_id


def version_of(lecture_id: str) -> int:
    try:
        return int(read_meta(lecture_id).get("version") or 1)
    except (TypeError, ValueError):
        return 1


def lineage_members(lineage_id: str) -> list:
    """같은 계보의 모든 버전을 version 오름차순으로 반환."""
    root = settings.storage_root / "lectures"
    if not root.exists():
        return []
    out = []
    for d in root.iterdir():
        if not d.is_dir():
            continue
        meta = read_meta(d)
        lid = meta.get("lineage_id") or d.name
        if lid != lineage_id:
            continue
        out.append({
            "lecture_id": d.name,
            "version":    int(meta.get("version") or 1),
            "parent_lecture_id": meta.get("parent_lecture_id"),
            "course":     meta.get("course", ""),
            "week":       meta.get("week", ""),
            "source_type": meta.get("source_type", ""),
            "has_lecture_json": (d / "lecture.json").exists(),
            "created_at": d.stat().st_mtime,
        })
    out.sort(key=lambda x: (x["version"], x["created_at"]))
    return out
