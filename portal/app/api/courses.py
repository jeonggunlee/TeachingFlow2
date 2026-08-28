import hashlib
import hmac
import secrets
import time
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
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
    # 주차는 1 이상이어야 한다 — 음수·0 주차가 들어가면 createLecture·analyzeLecture의
    # course+week 조회가 영원히 비는 유령 주차가 만들어진다.
    week:       int = Field(ge=1, le=60)
    title:      str = ""
    lecture_id: str = ""
    note:       str = ""

class LoginIn(BaseModel):
    password: str


# ── Auth ───────────────────────────────────────────────────────────────────

# 발급된 관리자 세션 토큰 (포털은 단일 프로세스 — 재시작하면 재로그인 필요).
_TOKEN_TTL = 14 * 24 * 3600      # 2주
_REVOKED: set = set()            # 로그아웃 즉시 무효화 (재시작하면 비워진다)


def _sign(payload: str) -> str:
    from ..config import PLAYLECTURE_ADMIN_PASSWORD
    key = f"portal-admin:{PLAYLECTURE_ADMIN_PASSWORD}".encode()
    return hmac.new(key, payload.encode(), hashlib.sha256).hexdigest()


def _issue_token() -> str:
    payload = f"{int(time.time()) + _TOKEN_TTL}.{secrets.token_urlsafe(12)}"
    return f"{payload}.{_sign(payload)}"


def _valid_token(token: str) -> bool:
    """서버가 서명했고 아직 만료되지 않은 토큰인지 확인한다.

    예전에는 발급한 토큰을 메모리 집합에 담아 두어, 포털을 재시작할 때마다
    교수자가 조용히 로그아웃됐다(과목 추가가 401로 막히는 원인이었다).
    서명 방식이라 재시작해도 유지되고, 관리자 비밀번호를 바꾸면
    기존 토큰이 한 번에 무효가 된다.
    """
    if not token or token in _REVOKED:
        return False
    exp, _, rest = token.partition(".")
    nonce, _, sig = rest.partition(".")
    if not sig or not exp.isdigit():
        return False
    if int(exp) < time.time():
        return False
    return hmac.compare_digest(sig, _sign(f"{exp}.{nonce}"))


def require_admin(authorization: str = Header(None)) -> str:
    """과목·주차 변경과 분석 트리거는 관리자 토큰이 있어야 한다.

    이전에는 로그인 성공 여부를 localStorage 플래그로만 두어, API 자체는
    누구나 호출할 수 있었다(과목 삭제·유료 분석 트리거 포함).
    """
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    if not _valid_token(token):
        raise HTTPException(401, "관리자 로그인이 필요합니다.",
                            headers={"WWW-Authenticate": "Bearer"})
    return token


@router.post("/api/auth/login")
async def admin_login(body: LoginIn):
    from ..config import PLAYLECTURE_ADMIN_PASSWORD
    if not secrets.compare_digest(body.password, PLAYLECTURE_ADMIN_PASSWORD):
        raise HTTPException(status_code=401, detail="비밀번호가 틀렸습니다")
    return {"ok": True, "token": _issue_token()}


@router.post("/api/auth/logout")
async def admin_logout(authorization: str = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        _REVOKED.add(authorization[7:])
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
async def create_course(body: CourseIn, db: AsyncSession = Depends(get_db),
                        _: str = Depends(require_admin)):
    c = Course(**body.model_dump())
    db.add(c)
    await db.commit()
    return {"id": c.id, "name": c.name, "code": c.code,
            "semester": c.semester, "description": c.description}


@router.delete("/api/courses/{course_id}", status_code=204)
async def delete_course(course_id: str, db: AsyncSession = Depends(get_db),
                        _: str = Depends(require_admin)):
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
async def add_week(course_id: str, body: WeekIn, db: AsyncSession = Depends(get_db),
                   _: str = Depends(require_admin)):
    if not await db.get(Course, course_id):
        raise HTTPException(404, "과목을 찾을 수 없습니다.")

    # 같은 주차를 두 번 만들면 두 카드가 같은 course+week 상태를 가리켜
    # 어느 쪽에서 분석을 눌러도 결과가 뒤섞인다.
    dup = await db.execute(
        select(WeeklyLecture).where(WeeklyLecture.course_id == course_id,
                                    WeeklyLecture.week == body.week)
    )
    if dup.scalars().first():
        raise HTTPException(409, f"{body.week}주차는 이미 등록되어 있습니다.")

    w = WeeklyLecture(course_id=course_id, **body.model_dump())
    db.add(w)
    await db.commit()
    return {"id": w.id, "week": w.week, "title": w.title, "lecture_id": w.lecture_id}


@router.put("/api/courses/{course_id}/weeks/{week_id}")
async def update_week(course_id: str, week_id: str, body: WeekIn,
                      db: AsyncSession = Depends(get_db),
                      _: str = Depends(require_admin)):
    w = await db.get(WeeklyLecture, week_id)
    if not w or w.course_id != course_id:
        raise HTTPException(404)
    for k, v in body.model_dump().items():
        setattr(w, k, v)
    await db.commit()
    return {"id": w.id, "week": w.week, "title": w.title, "lecture_id": w.lecture_id}


@router.delete("/api/courses/{course_id}/weeks/{week_id}", status_code=204)
async def delete_week(course_id: str, week_id: str, db: AsyncSession = Depends(get_db),
                      _: str = Depends(require_admin)):
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
async def proxy_analyze(lecture_id: str, _: str = Depends(require_admin)):
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
        "has_lectures":    False,
        "analyze_status":  None,
        "analyze_id":      None,
        "analyze_running": False,   # 완료본이 있어도 재분석이 돌고 있는지
        "report_count":    0,
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

        # analyzeLecture에서 해당 강의들의 보고서 확인.
        #
        # 단순히 generated_at 최대값 하나만 보면, 재분석을 시작한 직후처럼
        # 최신 보고서가 pending/error 인 경우 **이미 완성된 보고서가 있는데도**
        # 포털이 "분석 중"·"분석 오류"만 보여주고 보고서 링크가 사라진다.
        # → 완료본이 하나라도 있으면 done 을 유지하고, 진행 여부는 따로 알린다.
        try:
            r = await client.get(f"{ANALYZELECTURE_URL}/api/reports")
            if r.status_code == 200:
                matching = [x for x in r.json() if x.get("lecture_id") in lecture_ids]
                if matching:
                    by_time = lambda x: x.get("generated_at", "")
                    done    = [x for x in matching if x.get("status") == "done"]
                    running = [x for x in matching if x.get("status") in ("pending", "processing")]
                    errored = [x for x in matching if x.get("status") == "error"]

                    result["analyze_running"] = bool(running)
                    if done:
                        latest = max(done, key=by_time)
                        result["analyze_status"] = "done"
                        result["analyze_id"]     = latest["id"]
                    elif running:
                        latest = max(running, key=by_time)
                        result["analyze_status"] = latest["status"]
                        result["analyze_id"]     = latest["id"]
                    elif errored:
                        latest = max(errored, key=by_time)
                        result["analyze_status"] = "error"
                        result["analyze_id"]     = latest["id"]
                    result["report_count"] = len(done)
        except Exception:
            pass

    return result


@router.post("/api/proxy/analyze-week", status_code=202)
async def proxy_analyze_week(course: str = "", week: str = "",
                             _: str = Depends(require_admin)):
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
