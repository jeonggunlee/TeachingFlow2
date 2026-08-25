from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from fastapi.security import HTTPBasicCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import LectureSettings
from ..schemas import LectureSettingsIn
from .admin import require_admin

router = APIRouter()


async def get_settings(db: AsyncSession, lecture_id: str) -> Optional[LectureSettings]:
    """강의별 운영 설정을 조회한다(없으면 None)."""
    return await db.get(LectureSettings, lecture_id)


def _as_dict(row: Optional[LectureSettings]) -> dict:
    return {
        "ai_answer":     bool(row.ai_answer) if row else False,
        "auto_question": bool(row.auto_question) if row else False,
    }


@router.get("/api/lectures/{lecture_id}/settings")
async def public_settings(lecture_id: str, db: AsyncSession = Depends(get_db)):
    """수강생 플레이어가 참조하는 공개 설정(비밀 정보 없음)."""
    return _as_dict(await get_settings(db, lecture_id))


@router.get("/admin/lectures/{lecture_id}/settings")
async def admin_get_settings(
    lecture_id: str,
    db: AsyncSession = Depends(get_db),
    _: HTTPBasicCredentials = Depends(require_admin),
):
    return _as_dict(await get_settings(db, lecture_id))


@router.put("/admin/lectures/{lecture_id}/settings")
async def admin_set_settings(
    lecture_id: str,
    body: LectureSettingsIn,
    db: AsyncSession = Depends(get_db),
    _: HTTPBasicCredentials = Depends(require_admin),
):
    now = datetime.now(timezone.utc).isoformat()
    row = await db.get(LectureSettings, lecture_id)
    if row:
        row.ai_answer     = int(body.ai_answer)
        row.auto_question = int(body.auto_question)
        row.updated_at    = now
    else:
        row = LectureSettings(
            lecture_id=lecture_id,
            ai_answer=int(body.ai_answer),
            auto_question=int(body.auto_question),
            updated_at=now,
        )
        db.add(row)
    await db.commit()
    return _as_dict(row)
