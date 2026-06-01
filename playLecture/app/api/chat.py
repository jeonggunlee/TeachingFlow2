from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import ChatMessage, SlideKeyword, User
from ..schemas import ChatIn
from ..utils.keywords import extract_keywords
from .deps import get_current_user

router = APIRouter()


def _is_teacher(username: Optional[str]) -> bool:
    """username이 'prof'로 시작하거나 'prof' 토큰을 포함하면 교수로 간주."""
    if not username:
        return False
    u = username.lower()
    return u.startswith("prof") or "_prof" in u or "prof_" in u


@router.get("/api/chat/{lecture_id}/{slide_idx}")
async def get_messages(
    lecture_id: str,
    slide_idx: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChatMessage, User.username)
        .join(User, ChatMessage.user_id == User.id, isouter=True)
        .where(ChatMessage.lecture_id == lecture_id, ChatMessage.slide_idx == slide_idx)
        .order_by(ChatMessage.created_at)
    )
    rows = result.all()
    return [
        {
            "id":           m.id,
            "user_id":      m.user_id,
            "display_name": m.display_name,
            "message":      m.message,
            "created_at":   m.created_at,
            "is_mine":      m.user_id == user.id,
            "is_teacher":   _is_teacher(username),
        }
        for (m, username) in rows
    ]


@router.post("/api/chat/{lecture_id}/{slide_idx}")
async def post_message(
    lecture_id: str,
    slide_idx: int,
    body: ChatIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc).isoformat()

    msg = ChatMessage(
        lecture_id=lecture_id,
        slide_idx=slide_idx,
        user_id=user.id,
        display_name=user.display_name,
        message=body.message,
        created_at=now,
    )
    db.add(msg)

    # 키워드 추출 → SlideKeyword 업데이트
    keywords = extract_keywords(body.message)
    for kw in keywords:
        result = await db.execute(
            select(SlideKeyword).where(
                SlideKeyword.lecture_id == lecture_id,
                SlideKeyword.slide_idx  == slide_idx,
                SlideKeyword.keyword    == kw,
            )
        )
        row = result.scalar_one_or_none()
        if row:
            row.count      += 1
            row.updated_at  = now
        else:
            db.add(SlideKeyword(
                lecture_id=lecture_id,
                slide_idx=slide_idx,
                keyword=kw,
                count=1,
                updated_at=now,
            ))

    await db.commit()
    await db.refresh(msg)
    return {
        "id":           msg.id,
        "user_id":      msg.user_id,
        "display_name": msg.display_name,
        "message":      msg.message,
        "created_at":   msg.created_at,
        "is_mine":      True,
        "is_teacher":   _is_teacher(user.username),
    }
