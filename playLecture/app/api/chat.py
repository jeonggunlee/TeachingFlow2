from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import AsyncSessionLocal, get_db
from ..models import ChatMessage, SlideKeyword, User
from ..schemas import ChatIn
from ..services import ai_tutor
from ..utils.keywords import extract_keywords
from .deps import get_current_user, require_slide
from .settings import get_settings

router = APIRouter()

AI_TEACHER_NAME = "AI 교수"
AI_QUESTION_CAP = 3   # 슬라이드당 자동 생성 AI 질문 최대 개수 (스팸 방지)


def _is_teacher(username: Optional[str]) -> bool:
    """username이 'prof'로 시작하거나 'prof' 토큰을 포함하면 교수로 간주."""
    if not username:
        return False
    u = username.lower()
    return u.startswith("prof") or "_prof" in u or "prof_" in u


def _serialize(m: ChatMessage, username: Optional[str], my_id: int) -> dict:
    is_ai_teacher = m.origin == "ai_teacher"
    is_ai_student = m.origin == "ai_student"
    return {
        "id":           m.id,
        "user_id":      m.user_id,
        "display_name": m.display_name,
        "message":      m.message,
        "created_at":   m.created_at,
        # AI 메시지는 특정 수강생 소유가 아니므로 항상 남의 메시지로 표시
        "is_mine":      (m.origin == "student" and m.user_id == my_id),
        "is_teacher":   is_ai_teacher or _is_teacher(username),
        "is_ai":        is_ai_teacher or is_ai_student,
    }


async def _add_keywords(db: AsyncSession, lecture_id: str, slide_idx: int, text: str, now: str):
    for kw in extract_keywords(text):
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
                lecture_id=lecture_id, slide_idx=slide_idx,
                keyword=kw, count=1, updated_at=now,
            ))


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
    return [_serialize(m, username, user.id) for (m, username) in rows]


@router.post("/api/chat/{lecture_id}/{slide_idx}")
async def post_message(
    lecture_id: str,
    slide_idx: int,
    body: ChatIn,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_slide(db, lecture_id, slide_idx)
    now = datetime.now(timezone.utc).isoformat()

    msg = ChatMessage(
        lecture_id=lecture_id,
        slide_idx=slide_idx,
        user_id=user.id,
        display_name=user.display_name,
        message=body.message,
        created_at=now,
        origin="student",
    )
    db.add(msg)
    await _add_keywords(db, lecture_id, slide_idx, body.message, now)
    await db.commit()
    await db.refresh(msg)

    # AI 교수 답변 설정이 켜져 있으면 백그라운드로 답변 생성
    settings = await get_settings(db, lecture_id)
    if settings and settings.ai_answer and ai_tutor.is_enabled():
        background.add_task(_bg_answer, lecture_id, slide_idx, body.message)

    return _serialize(msg, user.username, user.id)


async def _bg_answer(lecture_id: str, slide_idx: int, question: str):
    """백그라운드: 학생 질문에 대한 AI 교수 답변을 생성해 저장."""
    answer = await ai_tutor.generate_answer(lecture_id, slide_idx, question)
    if not answer:
        return
    async with AsyncSessionLocal() as db:
        db.add(ChatMessage(
            lecture_id=lecture_id,
            slide_idx=slide_idx,
            user_id=0,
            display_name=AI_TEACHER_NAME,
            message=answer,
            created_at=datetime.now(timezone.utc).isoformat(),
            origin="ai_teacher",
        ))
        await db.commit()


@router.post("/api/chat/{lecture_id}/{slide_idx}/auto-question")
async def auto_question(
    lecture_id: str,
    slide_idx: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """자동 질문 생성 설정이 켜진 강의에서 학생풍 질문 + 교수 답변을 만든다.

    실제 수강생 질문을 소스로 활용한다. 생성 규칙(슬라이드당):
      · 아직 AI 질문이 없으면 → 1개 생성(seed, 실제 질문 없으면 스크립트 기반)
      · 실제 질문이 쌓이면 → 그 수를 넘지 않는 선에서 AI 질문을 추가(최대 AI_QUESTION_CAP개)
    → 실제 학생 질문이 늘수록 그것을 반영해 새 AI 질문이 만들어진다(스팸 방지 상한 존재).
    """
    await require_slide(db, lecture_id, slide_idx)

    settings = await get_settings(db, lecture_id)
    if not (settings and settings.auto_question and ai_tutor.is_enabled()):
        return {"generated": False, "reason": "disabled"}

    # 이 슬라이드에서 실제 수강생이 남긴 질문(소스) + 기존 AI 질문 수 집계
    rq_result = await db.execute(
        select(ChatMessage.message)
        .where(
            ChatMessage.lecture_id == lecture_id,
            ChatMessage.slide_idx  == slide_idx,
            ChatMessage.origin     == "student",
        )
        .order_by(ChatMessage.created_at.desc())
        .limit(30)
    )
    real_questions = [row[0] for row in rq_result.all()]
    rq = len(real_questions)

    aq_result = await db.execute(
        select(func.count()).select_from(ChatMessage).where(
            ChatMessage.lecture_id == lecture_id,
            ChatMessage.slide_idx  == slide_idx,
            ChatMessage.origin     == "ai_student",
        )
    )
    aq = aq_result.scalar() or 0

    # seed 1개는 허용, 그 이후로는 실제 질문 수를 넘지 않고 상한 이내에서만 추가
    allowed = (aq == 0) or (aq < AI_QUESTION_CAP and aq < rq)
    if not allowed:
        return {"generated": False, "reason": "exists"}

    # 이미 만든 AI 질문 → 중복 회피용으로 전달
    avoid_result = await db.execute(
        select(ChatMessage.message).where(
            ChatMessage.lecture_id == lecture_id,
            ChatMessage.slide_idx  == slide_idx,
            ChatMessage.origin     == "ai_student",
        )
    )
    avoid = [row[0] for row in avoid_result.all()]

    qa = await ai_tutor.generate_question(
        lecture_id, slide_idx, real_questions=real_questions, avoid=avoid,
    )
    if not qa:
        return {"generated": False, "reason": "no_result"}

    now = datetime.now(timezone.utc).isoformat()
    db.add(ChatMessage(
        lecture_id=lecture_id, slide_idx=slide_idx, user_id=0,
        display_name=qa["student_name"], message=qa["question"],
        created_at=now, origin="ai_student",
    ))
    # 답변이 질문보다 뒤에 오도록 created_at 을 1ms 앞서지 않게 그대로 둔다(정렬은 삽입 순).
    db.add(ChatMessage(
        lecture_id=lecture_id, slide_idx=slide_idx, user_id=0,
        display_name=AI_TEACHER_NAME, message=qa["answer"],
        created_at=datetime.now(timezone.utc).isoformat(), origin="ai_teacher",
    ))
    await db.commit()
    return {"generated": True, "based_on_real": qa.get("based_on_real", False)}
