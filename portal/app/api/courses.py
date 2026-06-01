from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import httpx

from ..config import (
    ANALYZELECTURE_URL,
    CREATELECTURE_URL,
    PLAYLECTURE_URL,
)
from ..database import get_db
from ..models import Course, WeeklyLecture

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────

class CourseIn(BaseModel):
    name:        str
    code:        str = ""
    semester:    str = ""
    description: str = ""

class WeekIn(BaseModel):
    week:       int
    title:      str = ""
    lecture_id: str = ""
    note:       str = ""

class LoginIn(BaseModel):
    password: str


# ── Auth ───────────────────────────────────────────────────────────────────

@router.post("/api/auth/login")
async def admin_login(body: LoginIn):
    from ..config import PLAYLECTURE_ADMIN_PASSWORD
    if body.password != PLAYLECTURE_ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="비밀번호가 틀렸습니다")
    return {"ok": True}


# ── Config ─────────────────────────────────────────────────────────────────

def _rehost(configured: str, request: Request) -> str:
    """브라우저가 실제로 접속한 host로 서비스 URL을 재작성한다 (포트는 config 값 유지).
    서버 간 호출은 config 상수(localhost)를 직접 쓰므로 영향받지 않고,
    브라우저로 내려가는 /api/config 응답만 외부 접속 host에 맞춰진다."""
    cfg = urlparse(configured)
    host = request.url.hostname or "localhost"
    scheme = request.headers.get("x-forwarded-proto") or request.url.scheme or "http"
    netloc = f"{host}:{cfg.port}" if cfg.port else host
    return f"{scheme}://{netloc}"


@router.get("/api/config")
async def get_config(request: Request):
    return {
        "createlecture_url":  _rehost(CREATELECTURE_URL, request),
        "playlecture_url":    _rehost(PLAYLECTURE_URL, request),
        "analyzelecture_url": _rehost(ANALYZELECTURE_URL, request),
    }


# ── Courses ────────────────────────────────────────────────────────────────

@router.get("/api/courses")
async def list_courses(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Course).order_by(Course.created_at))).scalars().all()
    return [
        {"id": c.id, "name": c.name, "code": c.code,
         "semester": c.semester, "description": c.description,
         "created_at": c.created_at}
        for c in rows
    ]


@router.post("/api/courses", status_code=201)
async def create_course(body: CourseIn, db: AsyncSession = Depends(get_db)):
    c = Course(**body.model_dump())
    db.add(c)
    await db.commit()
    return {"id": c.id, "name": c.name, "code": c.code,
            "semester": c.semester, "description": c.description}


@router.delete("/api/courses/{course_id}", status_code=204)
async def delete_course(course_id: str, db: AsyncSession = Depends(get_db)):
    c = await db.get(Course, course_id)
    if not c:
        raise HTTPException(404)
    for w in (await db.execute(
        select(WeeklyLecture).where(WeeklyLecture.course_id == course_id)
    )).scalars():
        await db.delete(w)
    await db.delete(c)
    await db.commit()


# ── Weekly lectures ────────────────────────────────────────────────────────

@router.get("/api/courses/{course_id}/weeks")
async def list_weeks(course_id: str, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(WeeklyLecture)
        .where(WeeklyLecture.course_id == course_id)
        .order_by(WeeklyLecture.week)
    )).scalars().all()
    return [
        {"id": w.id, "course_id": w.course_id, "week": w.week,
         "title": w.title, "lecture_id": w.lecture_id,
         "note": w.note, "created_at": w.created_at}
        for w in rows
    ]


@router.post("/api/courses/{course_id}/weeks", status_code=201)
async def add_week(course_id: str, body: WeekIn, db: AsyncSession = Depends(get_db)):
    if not await db.get(Course, course_id):
        raise HTTPException(404, "과목을 찾을 수 없습니다.")
    w = WeeklyLecture(course_id=course_id, **body.model_dump())
    db.add(w)
    await db.commit()
    return {"id": w.id, "week": w.week, "title": w.title, "lecture_id": w.lecture_id}


@router.put("/api/courses/{course_id}/weeks/{week_id}")
async def update_week(course_id: str, week_id: str, body: WeekIn,
                      db: AsyncSession = Depends(get_db)):
    w = await db.get(WeeklyLecture, week_id)
    if not w or w.course_id != course_id:
        raise HTTPException(404)
    for k, v in body.model_dump().items():
        setattr(w, k, v)
    await db.commit()
    return {"id": w.id, "week": w.week, "title": w.title, "lecture_id": w.lecture_id}


@router.delete("/api/courses/{course_id}/weeks/{week_id}", status_code=204)
async def delete_week(course_id: str, week_id: str, db: AsyncSession = Depends(get_db)):
    w = await db.get(WeeklyLecture, week_id)
    if not w or w.course_id != course_id:
        raise HTTPException(404)
    await db.delete(w)
    await db.commit()


# ── Status check ───────────────────────────────────────────────────────────

@router.get("/api/status/{lecture_id}")
async def check_status(lecture_id: str):
    """Probe playLecture and analyzeLecture for this lecture's current state."""
    result = {
        "play_exists":    False,
        "play_title":     None,
        "analyze_status": None,   # None | "pending" | "processing" | "done" | "error"
        "analyze_id":     None,
    }
    async with httpx.AsyncClient(timeout=5.0) as client:
        # playLecture — check if lecture exists
        try:
            r = await client.get(f"{PLAYLECTURE_URL}/api/lectures/{lecture_id}")
            if r.status_code == 200:
                result["play_exists"] = True
                result["play_title"]  = r.json().get("title")
        except Exception:
            pass

        # analyzeLecture — find latest report for this lecture
        try:
            r = await client.get(f"{ANALYZELECTURE_URL}/api/reports")
            if r.status_code == 200:
                reports = [x for x in r.json() if x.get("lecture_id") == lecture_id]
                if reports:
                    latest = max(reports, key=lambda x: x.get("generated_at", ""))
                    result["analyze_status"] = latest["status"]
                    result["analyze_id"]     = latest["id"]
        except Exception:
            pass

    return result


# ── Proxies ────────────────────────────────────────────────────────────────

@router.post("/api/proxy/analyze/{lecture_id}", status_code=202)
async def proxy_analyze(lecture_id: str):
    """Forward analysis trigger to analyzeLecture service."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            r = await client.post(f"{ANALYZELECTURE_URL}/api/analyze/{lecture_id}")
            return r.json()
        except Exception as e:
            raise HTTPException(502, f"analyzeLecture 연결 실패: {e}")


@router.get("/api/proxy/lectures")
async def proxy_lectures():
    """Fetch lecture list from playLecture for the lecture-ID picker."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            r = await client.get(f"{PLAYLECTURE_URL}/api/lectures")
            return r.json()
        except Exception:
            return []


@router.get("/api/status-week")
async def status_week(course: str = "", week: str = ""):
    """course+week 기준으로 createLecture 강의 존재 여부 + analyzeLecture 보고서 상태 확인."""
    result = {
        "has_lectures":   False,
        "analyze_status": None,
        "analyze_id":     None,
    }
    async with httpx.AsyncClient(timeout=5.0) as client:
        # createLecture에서 해당 주차 강의 목록 조회
        lecture_ids: list[str] = []
        try:
            r = await client.get(
                f"{CREATELECTURE_URL}/api/lectures",
                params={"course": course, "week": week},
            )
            if r.status_code == 200:
                lectures = r.json()
                lecture_ids = [l["lecture_id"] for l in lectures if "lecture_id" in l]
                result["has_lectures"] = len(lecture_ids) > 0
        except Exception:
            pass

        if not lecture_ids:
            return result

        # analyzeLecture에서 해당 강의들의 최신 보고서 확인
        try:
            r = await client.get(f"{ANALYZELECTURE_URL}/api/reports")
            if r.status_code == 200:
                matching = [x for x in r.json() if x.get("lecture_id") in lecture_ids]
                if matching:
                    latest = max(matching, key=lambda x: x.get("generated_at", ""))
                    result["analyze_status"] = latest["status"]
                    result["analyze_id"]     = latest["id"]
        except Exception:
            pass

    return result


@router.post("/api/proxy/analyze-week", status_code=202)
async def proxy_analyze_week(course: str = "", week: str = ""):
    """course+week 분석 트리거를 analyzeLecture 서비스로 전달."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            r = await client.post(
                f"{ANALYZELECTURE_URL}/api/analyze-week",
                params={"course": course, "week": week},
            )
            return r.json()
        except Exception as e:
            raise HTTPException(502, f"analyzeLecture 연결 실패: {e}")
