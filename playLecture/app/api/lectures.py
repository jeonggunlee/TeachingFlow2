import json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.params import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import CREATELECTURE_STORAGE_ROOT, STORAGE_ROOT
from ..database import get_db
from ..models import Lecture

router = APIRouter()


async def _auto_register(lecture_id: str, lj_path, db: AsyncSession) -> None:
    """createLecture 저장소의 lecture.json 으로 DB에 강의 자동 등록."""
    meta = json.loads(lj_path.read_text(encoding="utf-8"))
    slides = meta.get("slides", [])
    duration_ms = sum(
        seg.get("duration_ms", 0)
        for s in slides
        for seg in s.get("segments", [])
    )
    db.add(Lecture(
        id=lecture_id,
        title=meta.get("title", lecture_id),
        created_at=meta.get("created_at", ""),
        slide_count=len(slides),
        seg_count=sum(len(s.get("segments", [])) for s in slides),
        duration_ms=duration_ms,
        registered_at=datetime.now(timezone.utc).isoformat(),
    ))
    await db.commit()


@router.get("/api/lectures")
async def list_lectures(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Lecture).order_by(Lecture.registered_at.desc()))
    rows = result.scalars().all()
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
        for r in rows
    ]


@router.get("/api/lectures/{lecture_id}")
async def get_lecture(lecture_id: str, db: AsyncSession = Depends(get_db)):
    # ① playLecture 자체 저장소 확인
    local_lj = STORAGE_ROOT / "lectures" / lecture_id / "lecture.json"
    if local_lj.exists():
        return json.loads(local_lj.read_text(encoding="utf-8"))

    # ② createLecture 저장소에서 자동 임포트
    cl_lj = CREATELECTURE_STORAGE_ROOT / "lectures" / lecture_id / "lecture.json"
    if not cl_lj.exists():
        raise HTTPException(404, "강의를 찾을 수 없습니다.")

    existing = await db.get(Lecture, lecture_id)
    if not existing:
        await _auto_register(lecture_id, cl_lj, db)

    return json.loads(cl_lj.read_text(encoding="utf-8"))
