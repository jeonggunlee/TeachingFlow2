import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Lecture, PlaybackEvent, User
from ..schemas import PlaybackEventIn
from .deps import get_current_user

router = APIRouter()

MAX_EVENTS_PER_BATCH = 200


@router.post("/api/playback-event")
async def post_playback_events(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """재생 행동 이벤트 일괄 수집.

    sendBeacon 호환을 위해 Content-Type을 따지지 않고 raw body를 직접 파싱한다.
    body schema: {"lecture_id": "...", "events": [{slide_idx, seg_idx, event_type, position_ms, payload}, ...]}
    """
    raw = await request.body()
    if not raw:
        raise HTTPException(400, "empty body")

    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise HTTPException(400, "invalid JSON")

    if not isinstance(data, dict) or not isinstance(data.get("lecture_id"), str):
        raise HTTPException(400, "invalid payload: lecture_id required")
    raw_events = data.get("events")
    if not isinstance(raw_events, list):
        raise HTTPException(400, "invalid payload: events must be a list")
    if len(raw_events) > MAX_EVENTS_PER_BATCH:
        raise HTTPException(400, f"too many events (max {MAX_EVENTS_PER_BATCH})")

    lecture = await db.get(Lecture, data["lecture_id"])
    if not lecture:
        raise HTTPException(404, "lecture not found")

    # 이벤트는 한 건씩 검증한다 — 배치 하나에 이상한 항목이 섞였다고
    # 정상 이벤트까지 버리면 텔레메트리에 구멍이 생긴다.
    events, rejected = [], 0
    for raw in raw_events:
        try:
            events.append(PlaybackEventIn.model_validate(raw))
        except Exception:
            rejected += 1

    now = datetime.now(timezone.utc).isoformat()
    saved = 0
    for ev in events:
        if ev.slide_idx < 0 or ev.slide_idx >= lecture.slide_count:
            rejected += 1
            continue
        payload_str = None
        if ev.payload:
            try:
                payload_str = json.dumps(ev.payload, ensure_ascii=False)[:1000]
            except (TypeError, ValueError):
                payload_str = None
        db.add(PlaybackEvent(
            lecture_id=data["lecture_id"],
            user_id=user.id,
            slide_idx=ev.slide_idx,
            seg_idx=ev.seg_idx,
            event_type=ev.event_type,
            position_ms=max(0.0, ev.position_ms),
            payload=payload_str,
            created_at=now,
        ))
        saved += 1

    await db.commit()
    return {"ok": True, "saved": saved, "rejected": rejected}
