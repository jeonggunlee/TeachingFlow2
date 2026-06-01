from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Progress, User
from ..schemas import ProgressIn
from .deps import get_current_user

router = APIRouter()


@router.get("/api/progress/{lecture_id}")
async def get_progress(
    lecture_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await db.get(Progress, (user.id, lecture_id))
    if not row:
        return {"slide_idx": 0, "seg_idx": 0, "pct": 0.0}
    return {"slide_idx": row.slide_idx, "seg_idx": row.seg_idx, "pct": row.pct}


@router.post("/api/progress/{lecture_id}")  # sendBeacon(beforeunload) 전용
@router.put("/api/progress/{lecture_id}")
async def save_progress(
    lecture_id: str,
    body: ProgressIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc).isoformat()
    row = await db.get(Progress, (user.id, lecture_id))
    if row:
        row.slide_idx  = body.slide_idx
        row.seg_idx    = body.seg_idx
        row.pct        = body.pct
        row.updated_at = now
    else:
        db.add(Progress(
            user_id=user.id,
            lecture_id=lecture_id,
            slide_idx=body.slide_idx,
            seg_idx=body.seg_idx,
            pct=body.pct,
            updated_at=now,
        ))
    await db.commit()
    return {"ok": True}
