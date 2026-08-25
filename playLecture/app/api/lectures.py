import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.params import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import CREATELECTURE_STORAGE_ROOT, STORAGE_ROOT
from ..database import get_db
from ..models import Lecture

router = APIRouter()


def lecture_json_path(lecture_id: str) -> Optional[Path]:
    """이 강의의 lecture.json 실제 경로. 두 저장소 어디에도 없으면 None.

    createLecture에서 강의 디렉터리가 삭제되면 playLecture DB 행만 남아
    "목록에는 보이지만 열면 404"인 유령 강의가 된다. 이 함수로 실재 여부를 판정한다.
    """
    for root in (STORAGE_ROOT, CREATELECTURE_STORAGE_ROOT):
        p = root / "lectures" / lecture_id / "lecture.json"
        if p.exists():
            return p
    return None


def _counts(meta: dict) -> dict:
    slides = meta.get("slides", [])
    return {
        "slide_count": len(slides),
        "seg_count":   sum(len(s.get("segments", [])) for s in slides),
        "duration_ms": sum(seg.get("duration_ms", 0)
                           for s in slides for seg in s.get("segments", [])),
    }


async def _auto_register(lecture_id: str, lj_path, db: AsyncSession) -> None:
    """createLecture 저장소의 lecture.json 으로 DB에 강의 자동 등록."""
    meta = json.loads(lj_path.read_text(encoding="utf-8"))
    db.add(Lecture(
        id=lecture_id,
        title=meta.get("title", lecture_id),
        created_at=meta.get("created_at", ""),
        registered_at=datetime.now(timezone.utc).isoformat(),
        **_counts(meta),
    ))
    await db.commit()


async def _refresh_if_stale(row: Lecture, lj_path, db: AsyncSession) -> None:
    """lecture.json이 다시 빌드돼 장수·세그먼트 수가 달라졌으면 DB를 갱신한다.

    갱신하지 않으면 `/admin/analytics`가 옛 slide_count 범위만 돌려주어
    새로 생긴 슬라이드의 수강 데이터가 분석에서 통째로 빠진다.
    """
    try:
        meta = json.loads(lj_path.read_text(encoding="utf-8"))
    except Exception:
        return
    c = _counts(meta)
    title = meta.get("title", row.title)
    if (row.slide_count == c["slide_count"] and row.seg_count == c["seg_count"]
            and row.title == title):
        return
    row.slide_count = c["slide_count"]
    row.seg_count   = c["seg_count"]
    row.duration_ms = c["duration_ms"]
    row.title       = title
    await db.commit()


@router.get("/api/lectures")
async def list_lectures(db: AsyncSession = Depends(get_db)):
    """수강생용 강의 목록 — 실제 파일이 있는 강의만 노출한다."""
    result = await db.execute(select(Lecture).order_by(Lecture.registered_at.desc()))
    return [
        {
            "id": r.id,
            "title": r.title,
            "created_at": r.created_at,
            "slide_count": r.slide_count,
            "seg_count": r.seg_count,
            "duration_ms": r.duration_ms,
            "registered_at": r.registered_at,
        }
        for r in result.scalars().all()
        if lecture_json_path(r.id) is not None
    ]


@router.get("/api/lectures/{lecture_id}")
async def get_lecture(lecture_id: str, db: AsyncSession = Depends(get_db)):
    lj = lecture_json_path(lecture_id)
    if lj is None:
        raise HTTPException(404, "강의를 찾을 수 없습니다.")

    existing = await db.get(Lecture, lecture_id)
    if not existing:
        await _auto_register(lecture_id, lj, db)
    else:
        await _refresh_if_stale(existing, lj, db)

    return json.loads(lj.read_text(encoding="utf-8"))
