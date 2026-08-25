import json
import os
import secrets
import shutil
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import delete, func

from ..config import ADMIN_PASSWORD, CREATELECTURE_STORAGE_ROOT, STORAGE_ROOT
from ..database import get_db
from ..models import ChatMessage, DifficultyRating, Lecture, LectureSettings, PlaybackEvent, Progress, QuizResponse, SlideKeyword
from .lectures import lecture_json_path

router   = APIRouter()
security = HTTPBasic()

# 강의 삭제 시 함께 지워야 하는 수강 데이터 테이블
ANALYTICS_MODELS = (DifficultyRating, ChatMessage, SlideKeyword, Progress,
                    PlaybackEvent, QuizResponse, LectureSettings)


async def _purge_lecture_rows(db: AsyncSession, lecture_id: str) -> None:
    for model in ANALYTICS_MODELS:
        await db.execute(delete(model).where(model.lecture_id == lecture_id))


def require_admin(creds: HTTPBasicCredentials = Depends(security)):
    u_ok = secrets.compare_digest(creds.username, "admin")
    p_ok = secrets.compare_digest(creds.password, ADMIN_PASSWORD)
    if not (u_ok and p_ok):
        raise HTTPException(401, "인증 실패", headers={"WWW-Authenticate": "Basic"})
    return creds


@router.post("/admin/upload")
async def upload_lecture(
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    _: HTTPBasicCredentials = Depends(require_admin),
):
    if not (file.filename or "").endswith(".zip"):
        raise HTTPException(400, "ZIP 파일만 업로드 가능합니다.")

    # 업로드 파일명은 신뢰할 수 없다 — 경로 구분자가 섞이면 storage 밖에 쓰일 수 있으므로
    # 파일명을 쓰지 않고 임시 파일에 받는다. 어떤 경로로 빠져나가도 실패하도록.
    fd, tmp_name = tempfile.mkstemp(suffix=".zip")
    tmp = Path(tmp_name)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(await file.read())

        try:
            with zipfile.ZipFile(tmp) as zf:
                if "lecture.json" not in zf.namelist():
                    raise HTTPException(400, "lecture.json이 없는 파일입니다.")
                meta = json.loads(zf.read("lecture.json"))
        except zipfile.BadZipFile:
            raise HTTPException(400, "올바른 ZIP 파일이 아닙니다.")
        except json.JSONDecodeError:
            raise HTTPException(400, "lecture.json을 읽을 수 없습니다.")

        lecture_id = meta.get("lecture_id")
        if not lecture_id or lecture_id != Path(str(lecture_id)).name or lecture_id.startswith("."):
            raise HTTPException(400, "lecture.json의 lecture_id가 없거나 올바르지 않습니다.")

        dest = STORAGE_ROOT / "lectures" / lecture_id
        if dest.exists():
            shutil.rmtree(dest)
        with zipfile.ZipFile(tmp) as zf:
            zf.extractall(dest)
    finally:
        tmp.unlink(missing_ok=True)

    slides = meta.get("slides", [])
    duration_ms = sum(
        seg.get("duration_ms", 0)
        for s in slides
        for seg in s.get("segments", [])
    )

    existing = await db.get(Lecture, lecture_id)
    if existing:
        # Cascade-delete all analytics rows before removing the lecture row
        await _purge_lecture_rows(db, lecture_id)
        await db.delete(existing)
        await db.flush()

    lecture = Lecture(
        id=lecture_id,
        title=meta.get("title", lecture_id),
        created_at=meta.get("created_at", ""),
        slide_count=len(slides),
        seg_count=sum(len(s.get("segments", [])) for s in slides),
        duration_ms=duration_ms,
        registered_at=datetime.now(timezone.utc).isoformat(),
    )
    db.add(lecture)
    await db.commit()

    return {"lecture_id": lecture_id, "title": lecture.title}


@router.delete("/admin/lectures/{lecture_id}")
async def delete_lecture(
    lecture_id: str,
    db: AsyncSession = Depends(get_db),
    _: HTTPBasicCredentials = Depends(require_admin),
):
    lecture = await db.get(Lecture, lecture_id)
    if not lecture:
        raise HTTPException(404, "강의를 찾을 수 없습니다.")

    dest = STORAGE_ROOT / "lectures" / lecture_id
    if dest.exists():
        shutil.rmtree(dest)

    # Cascade-delete all analytics rows before removing the lecture row
    await _purge_lecture_rows(db, lecture_id)
    await db.delete(lecture)
    await db.commit()
    return {"ok": True}


@router.post("/admin/prune-missing")
async def prune_missing(
    db: AsyncSession = Depends(get_db),
    _: HTTPBasicCredentials = Depends(require_admin),
):
    """파일이 사라진 강의(유령 강의)의 DB 행과 수강 데이터를 정리한다.

    createLecture에서 강의 디렉터리를 지워도 playLecture DB 행은 남는다.
    그대로 두면 분석 대상 목록에 계속 잡히고, 실체 없는 CQI 보고서가 만들어진다.
    """
    result = await db.execute(select(Lecture))
    removed = []
    for row in result.scalars().all():
        if lecture_json_path(row.id) is not None:
            continue
        await _purge_lecture_rows(db, row.id)
        await db.delete(row)
        removed.append({"lecture_id": row.id, "title": row.title})
    await db.commit()
    return {"removed": len(removed), "lectures": removed}


@router.get("/admin/lectures")
async def list_all(
    db: AsyncSession = Depends(get_db),
    _: HTTPBasicCredentials = Depends(require_admin),
):
    result = await db.execute(
        select(Lecture, LectureSettings)
        .join(LectureSettings, Lecture.id == LectureSettings.lecture_id, isouter=True)
        .order_by(Lecture.registered_at.desc())
    )
    return [
        {
            "id": r.id,
            "title": r.title,
            "created_at": r.created_at,
            "slide_count": r.slide_count,
            "seg_count": r.seg_count,
            "duration_ms": r.duration_ms,
            "registered_at": r.registered_at,
            "ai_answer":     bool(s.ai_answer) if s else False,
            "auto_question": bool(s.auto_question) if s else False,
            # 파일이 실재하는지 — False면 재생·분석이 불가능한 유령 강의
            "files_present": lecture_json_path(r.id) is not None,
        }
        for (r, s) in result.all()
    ]


@router.get("/admin/analytics/{lecture_id}")
async def get_analytics(
    lecture_id: str,
    db: AsyncSession = Depends(get_db),
    _: HTTPBasicCredentials = Depends(require_admin),
):
    """강의 분석: 슬라이드별 난이도 분포 + 상위 키워드."""
    lecture = await db.get(Lecture, lecture_id)
    if not lecture:
        raise HTTPException(404, "강의를 찾을 수 없습니다.")

    # 슬라이드별 난이도 집계
    diff_result = await db.execute(
        select(DifficultyRating.slide_idx, DifficultyRating.rating, func.count())
        .where(DifficultyRating.lecture_id == lecture_id)
        .group_by(DifficultyRating.slide_idx, DifficultyRating.rating)
        .order_by(DifficultyRating.slide_idx)
    )
    diff_rows = diff_result.all()

    diff_by_slide: dict[int, dict] = {}
    for slide_idx, rating, count in diff_rows:
        label = {0: "쉬움", 1: "보통", 2: "어려움"}.get(rating)
        if label is None:
            continue   # 정의되지 않은 rating 값은 집계에서 제외 (합계 왜곡 방지)
        d = diff_by_slide.setdefault(slide_idx, {"쉬움": 0, "보통": 0, "어려움": 0, "total": 0})
        d[label] = count
        d["total"] += count

    # 슬라이드별 상위 키워드 (count 내림차순 top 10)
    kw_result = await db.execute(
        select(SlideKeyword.slide_idx, SlideKeyword.keyword, SlideKeyword.count)
        .where(SlideKeyword.lecture_id == lecture_id)
        .order_by(SlideKeyword.slide_idx, SlideKeyword.count.desc())
    )
    kw_rows = kw_result.all()

    kw_by_slide: dict[int, list] = {}
    for slide_idx, keyword, count in kw_rows:
        lst = kw_by_slide.setdefault(slide_idx, [])
        if len(lst) < 10:
            lst.append({"keyword": keyword, "count": count})

    # 슬라이드별 질문 전문 (created_at 오름차순)
    # AI 생성 메시지(ai_student/ai_teacher)는 실제 수강 데이터가 아니므로 분석에서 제외
    chat_result = await db.execute(
        select(ChatMessage.slide_idx, ChatMessage.display_name,
               ChatMessage.message, ChatMessage.created_at)
        .where(ChatMessage.lecture_id == lecture_id,
               ChatMessage.origin == "student")
        .order_by(ChatMessage.slide_idx, ChatMessage.created_at)
    )
    chat_rows = chat_result.all()

    questions_by_slide: dict[int, list] = {}
    for slide_idx, display_name, message, created_at in chat_rows:
        questions_by_slide.setdefault(slide_idx, []).append({
            "display_name": display_name,
            "message":      message,
            "created_at":   created_at,
        })

    # 슬라이드별 재생 행동 텔레메트리 집계
    pb_result = await db.execute(
        select(PlaybackEvent.slide_idx, PlaybackEvent.event_type, func.count())
        .where(PlaybackEvent.lecture_id == lecture_id)
        .group_by(PlaybackEvent.slide_idx, PlaybackEvent.event_type)
    )
    _EVENT_KEYS = ("pause", "seek_back", "seek_forward", "replay", "speed_change")
    pb_by_slide: dict[int, dict] = {}
    for slide_idx, event_type, count in pb_result.all():
        d = pb_by_slide.setdefault(
            slide_idx, {k: 0 for k in _EVENT_KEYS} | {"total": 0}
        )
        if event_type in d:
            d[event_type] = count
            d["total"] += count

    # 슬라이드별 퀴즈 응답 집계 — total/correct/option_distribution
    qz_total_result = await db.execute(
        select(QuizResponse.slide_idx, func.count(), func.sum(QuizResponse.is_correct))
        .where(QuizResponse.lecture_id == lecture_id)
        .group_by(QuizResponse.slide_idx)
    )
    qz_by_slide: dict[int, dict] = {}
    for slide_idx, total, correct in qz_total_result.all():
        c = int(correct or 0)
        t = int(total or 0)
        qz_by_slide[slide_idx] = {
            "total_responses": t,
            "correct_count":   c,
            "accuracy":        (c / t) if t else None,
            "option_distribution": [],
            "n_options":       0,
        }

    qz_dist_result = await db.execute(
        select(QuizResponse.slide_idx, QuizResponse.answer_index, func.count())
        .where(QuizResponse.lecture_id == lecture_id)
        .group_by(QuizResponse.slide_idx, QuizResponse.answer_index)
    )
    qz_dist_raw: dict[int, dict[int, int]] = {}
    for slide_idx, ai, n in qz_dist_result.all():
        qz_dist_raw.setdefault(slide_idx, {})[ai] = n

    # lecture.json에서 슬라이드 제목 + 퀴즈 옵션 개수·correct_index 조회 (배경 정보).
    # 제목은 분석 프롬프트의 근거이자 CQI 원장이 슬라이드를 다시 찾는 단서가 된다.
    quiz_meta_by_slide: dict[int, dict] = {}
    title_by_slide: dict[int, str] = {}
    lj = lecture_json_path(lecture_id)
    if lj is not None:
        try:
            ljd = json.loads(lj.read_text(encoding="utf-8"))
            for s in ljd.get("slides", []):
                zero_idx = int(s.get("index", 0)) - 1
                if s.get("title"):
                    title_by_slide[zero_idx] = str(s["title"])
                q = s.get("quiz")
                if q and q.get("type") == "mcq":
                    quiz_meta_by_slide[zero_idx] = {
                        "n_options":     len(q.get("options", [])),
                        "correct_index": q.get("correct_index"),
                    }
        except Exception:
            pass

    # option_distribution 채우기 (옵션 개수만큼)
    for slide_idx, raw_dist in qz_dist_raw.items():
        meta = quiz_meta_by_slide.get(slide_idx, {})
        n_opts = meta.get("n_options") or (max(raw_dist.keys()) + 1 if raw_dist else 0)
        dist = [0] * n_opts
        for ai, n in raw_dist.items():
            if 0 <= ai < n_opts:
                dist[ai] = n
        if slide_idx in qz_by_slide:
            qz_by_slide[slide_idx]["option_distribution"] = dist
            qz_by_slide[slide_idx]["n_options"] = n_opts
            qz_by_slide[slide_idx]["correct_index"] = meta.get("correct_index")

    # 슬라이드 0 ~ slide_count-1 로 병합
    slides = []
    for i in range(lecture.slide_count):
        slides.append({
            "slide_idx":     i,
            "slide_title":   title_by_slide.get(i, ""),
            "difficulty":    diff_by_slide.get(i, {"쉬움": 0, "보통": 0, "어려움": 0, "total": 0}),
            "keywords":      kw_by_slide.get(i, []),
            "questions":     questions_by_slide.get(i, []),
            "playback_stats": pb_by_slide.get(
                i, {k: 0 for k in _EVENT_KEYS} | {"total": 0}
            ),
            "quiz_stats":    qz_by_slide.get(i, {
                "total_responses": 0, "correct_count": 0, "accuracy": None,
                "option_distribution": [], "n_options": 0,
            }),
        })

    return {
        "lecture_id":   lecture_id,
        "title":        lecture.title,
        "slide_count":  lecture.slide_count,
        "slides":       slides,
    }
