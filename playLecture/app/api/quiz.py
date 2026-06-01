"""체크포인트 퀴즈 응시 API.

lecture.json의 slides[i].quiz 필드에서 정답을 읽어 검증한다.
정답 인덱스는 절대 응답 본문에 노출하지 않는다 (제출 후에만 반환).
"""
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import CREATELECTURE_STORAGE_ROOT, STORAGE_ROOT
from ..database import get_db
from ..models import Lecture, QuizResponse, User
from .deps import get_current_user

router = APIRouter()


class QuizAnswerIn(BaseModel):
    answer_index: int = Field(ge=0)


def _load_lecture_json(lecture_id: str) -> dict:
    local = STORAGE_ROOT / "lectures" / lecture_id / "lecture.json"
    if local.exists():
        return json.loads(local.read_text(encoding="utf-8"))
    cl = CREATELECTURE_STORAGE_ROOT / "lectures" / lecture_id / "lecture.json"
    if cl.exists():
        return json.loads(cl.read_text(encoding="utf-8"))
    raise HTTPException(404, "강의 데이터를 찾을 수 없습니다.")


def _quiz_for_slide(lecture_json: dict, slide_idx: int) -> dict:
    """lecture.json에서 slide_idx(0-based)의 quiz dict를 반환.
    lecture.json의 slides는 1-based 'index' 키를 쓰므로 보정."""
    target = slide_idx + 1
    for s in lecture_json.get("slides", []):
        if s.get("index") == target:
            q = s.get("quiz")
            if q and q.get("type") == "mcq":
                return q
            raise HTTPException(404, "이 슬라이드에는 퀴즈가 없습니다.")
    raise HTTPException(404, "슬라이드를 찾을 수 없습니다.")


@router.get("/api/quiz/{lecture_id}/{slide_idx}")
async def get_quiz(
    lecture_id: str,
    slide_idx: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """퀴즈 본문(정답 제외) + 내 응답(있으면) + 누적 통계."""
    lj = _load_lecture_json(lecture_id)
    q  = _quiz_for_slide(lj, slide_idx)

    my_row = await db.get(QuizResponse, (user.id, lecture_id, slide_idx))
    my_response = None
    if my_row:
        my_response = {
            "answer_index": my_row.answer_index,
            "is_correct":   bool(my_row.is_correct),
            "answered_at":  my_row.answered_at,
        }

    # 누적 통계 (응답 수, 정답 수, 옵션별 분포)
    total = (await db.execute(
        select(func.count())
        .select_from(QuizResponse)
        .where(QuizResponse.lecture_id == lecture_id,
               QuizResponse.slide_idx  == slide_idx)
    )).scalar() or 0
    correct = (await db.execute(
        select(func.count())
        .select_from(QuizResponse)
        .where(QuizResponse.lecture_id == lecture_id,
               QuizResponse.slide_idx  == slide_idx,
               QuizResponse.is_correct == 1)
    )).scalar() or 0
    dist_rows = (await db.execute(
        select(QuizResponse.answer_index, func.count())
        .where(QuizResponse.lecture_id == lecture_id,
               QuizResponse.slide_idx  == slide_idx)
        .group_by(QuizResponse.answer_index)
    )).all()
    dist = [0] * len(q["options"])
    for ai, n in dist_rows:
        if 0 <= ai < len(dist):
            dist[ai] = n

    return {
        "slide_idx": slide_idx,
        "quiz": {
            "type":     "mcq",
            "question": q["question"],
            "options":  q["options"],
            # correct_index와 explanation은 응답 제출 후에만 노출
        },
        "my_response": my_response,
        "stats": {
            "total_responses": total,
            "correct_count":   correct,
            "accuracy":        (correct / total) if total else None,
            "option_distribution": dist,
        },
    }


@router.post("/api/quiz/{lecture_id}/{slide_idx}")
async def post_quiz(
    lecture_id: str,
    slide_idx:  int,
    body:  QuizAnswerIn,
    user:  User = Depends(get_current_user),
    db:    AsyncSession = Depends(get_db),
):
    """응답 제출. 재제출 시 갱신. 응답 후 정답·해설 공개."""
    lj = _load_lecture_json(lecture_id)
    q  = _quiz_for_slide(lj, slide_idx)

    n_options = len(q["options"])
    if not (0 <= body.answer_index < n_options):
        raise HTTPException(400, f"answer_index는 0~{n_options - 1} 범위여야 합니다.")

    is_correct = int(body.answer_index == q["correct_index"])
    now = datetime.now(timezone.utc).isoformat()

    row = await db.get(QuizResponse, (user.id, lecture_id, slide_idx))
    if row:
        row.answer_index = body.answer_index
        row.is_correct   = is_correct
        row.answered_at  = now
    else:
        db.add(QuizResponse(
            user_id=user.id,
            lecture_id=lecture_id,
            slide_idx=slide_idx,
            answer_index=body.answer_index,
            is_correct=is_correct,
            answered_at=now,
        ))
    await db.commit()

    return {
        "ok":             True,
        "is_correct":     bool(is_correct),
        "correct_index":  q["correct_index"],
        "explanation":    q.get("explanation", ""),
    }
