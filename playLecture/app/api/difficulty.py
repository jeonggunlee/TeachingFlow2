from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import DifficultyRating, User
from ..schemas import DifficultyIn
from .deps import get_current_user, require_slide

router = APIRouter()

LABELS = {0: "쉬움", 1: "보통", 2: "어려움"}


@router.get("/api/difficulty/{lecture_id}/{slide_idx}")
async def get_difficulty(
    lecture_id: str,
    slide_idx: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # 내 평가
    my_row = await db.get(DifficultyRating, (user.id, lecture_id, slide_idx))
    my_rating = my_row.rating if my_row else None

    # 슬라이드 전체 집계 (0~2 각 count)
    result = await db.execute(
        select(DifficultyRating.rating, func.count(DifficultyRating.rating))
        .where(DifficultyRating.lecture_id == lecture_id,
               DifficultyRating.slide_idx  == slide_idx)
        .group_by(DifficultyRating.rating)
    )
    counts = {r: c for r, c in result.all()}

    return {
        "my_rating": my_rating,
        "counts":    {LABELS[k]: counts.get(k, 0) for k in (0, 1, 2)},
        "total":     sum(counts.values()),
    }


@router.get("/api/difficulty/{lecture_id}")
async def get_all_difficulty(
    lecture_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """강의 전체 슬라이드 난이도 집계 (슬라이드별 평균·분포)."""
    result = await db.execute(
        select(DifficultyRating.slide_idx, DifficultyRating.rating,
               func.count(DifficultyRating.rating))
        .where(DifficultyRating.lecture_id == lecture_id)
        .group_by(DifficultyRating.slide_idx, DifficultyRating.rating)
        .order_by(DifficultyRating.slide_idx)
    )
    rows = result.all()

    by_slide: dict[int, dict[int, int]] = {}
    for slide_idx, rating, count in rows:
        by_slide.setdefault(slide_idx, {})[rating] = count

    return [
        {
            "slide_idx": si,
            "counts": {LABELS[k]: by_slide[si].get(k, 0) for k in (0, 1, 2)},
            "total":  sum(by_slide[si].values()),
            "avg":    sum(r * c for r, c in by_slide[si].items())
                      / sum(by_slide[si].values()),
        }
        for si in sorted(by_slide.keys())
    ]


@router.put("/api/difficulty/{lecture_id}/{slide_idx}")
async def set_difficulty(
    lecture_id: str,
    slide_idx: int,
    body: DifficultyIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_slide(db, lecture_id, slide_idx)
    now = datetime.now(timezone.utc).isoformat()
    row = await db.get(DifficultyRating, (user.id, lecture_id, slide_idx))
    if row:
        row.rating     = body.rating
        row.updated_at = now
    else:
        db.add(DifficultyRating(
            user_id=user.id,
            lecture_id=lecture_id,
            slide_idx=slide_idx,
            rating=body.rating,
            updated_at=now,
        ))
    await db.commit()
    return {"ok": True, "rating": body.rating}
