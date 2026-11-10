import json
import re
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from app.config import settings

# 강의 ID 허용 형식: 영숫자로 시작, 영숫자·_·- 만, 64자 이하.
# 기존 ID(`2026-05-24_d6b1d14c`, `2026-05-24_AI101W2_9ad01d`)는 모두 통과하고
# `..`·`/`·숨김 파일처럼 storage 밖을 가리킬 수 있는 값은 전부 거부한다.
_LECTURE_ID_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}")


class InvalidLectureId(ValueError):
    """경로에 쓸 수 없는 강의 ID. main.py 가 400 으로 변환한다."""


def validate_lecture_id(lecture_id) -> str:
    if not isinstance(lecture_id, str) or not _LECTURE_ID_RE.fullmatch(lecture_id):
        raise InvalidLectureId(f"잘못된 강의 ID: {lecture_id!r}")
    return lecture_id


def new_lecture_id() -> str:
    return f"{datetime.now().strftime('%Y-%m-%d')}_{uuid4().hex[:8]}"


def lecture_dir(lecture_id: str) -> Path:
    # 예전에는 받은 문자열을 그대로 경로에 붙였다 — DELETE /api/lectures/.. 가
    # storage 디렉터리 전체를 rmtree 할 수 있었다.
    return settings.storage_root / "lectures" / validate_lecture_id(lecture_id)


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
