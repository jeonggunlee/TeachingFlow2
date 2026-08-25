import json
import uuid
from datetime import datetime, timezone
from urllib.parse import urlparse

import httpx
from anthropic import AsyncAnthropic
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import (
    ANTHROPIC_API_KEY,
    CLAUDE_MODEL,
    CREATELECTURE_URL,
    PLAYLECTURE_ADMIN_PASSWORD,
    PLAYLECTURE_URL,
)
from ..database import get_db
from ..models import CQIReport

router = APIRouter()
_anthropic = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)


# ── createLecture / playLecture 헬퍼 ─────────────────

async def fetch_lecture_context(lecture_id: str) -> dict:
    """createLecture에서 특정 강의의 course/week/week_title 메타 조회.

    week_title 은 강의 title에서 "{course}-{week}주차-" 접두를 제거해 얻는다
    (lecture_builder가 그런 형식으로 조립하기 때문). 접두가 없으면 title 그대로.
    실패 시 빈 dict 반환 — 강의 제작 적용 시 필터가 비어 전체 목록이 보이는
    fallback이 동작한다.
    """
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{CREATELECTURE_URL}/api/lectures")
            r.raise_for_status()
            for lec in r.json():
                if lec.get("lecture_id") == lecture_id:
                    course = lec.get("course", "") or ""
                    week   = lec.get("week", "") or ""
                    title  = lec.get("title", "") or ""
                    week_title = title
                    if course and week:
                        prefix = f"{course}-{week}주차-"
                        if title.startswith(prefix):
                            week_title = title[len(prefix):]
                    return {
                        "course":     course,
                        "week":       week,
                        "week_title": week_title,
                    }
    except Exception:
        pass
    return {}


async def fetch_week_lectures(course: str, week: str) -> list[dict]:
    """createLecture에서 특정 course+week 강의 목록 조회."""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{CREATELECTURE_URL}/api/lectures",
            params={"course": course, "week": week},
            timeout=10,
        )
        r.raise_for_status()
        return r.json()


async def ensure_play_imported(lecture_id: str) -> bool:
    """playLecture에 강의 자동 임포트 트리거 (GET 한 번으로 충분)."""
    async with httpx.AsyncClient() as client:
        try:
            r = await client.get(f"{PLAYLECTURE_URL}/api/lectures/{lecture_id}", timeout=10)
            return r.status_code == 200
        except Exception:
            return False


async def fetch_lectures() -> list[dict]:
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{PLAYLECTURE_URL}/admin/lectures",
            auth=("admin", PLAYLECTURE_ADMIN_PASSWORD),
            timeout=10,
        )
        r.raise_for_status()
        return r.json()


async def fetch_analytics(lecture_id: str) -> dict:
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{PLAYLECTURE_URL}/admin/analytics/{lecture_id}",
            auth=("admin", PLAYLECTURE_ADMIN_PASSWORD),
            timeout=15,
        )
        r.raise_for_status()
        return r.json()


# ── Claude 분석 ──────────────────────────────────────

def _build_prompt(analytics: dict) -> str:
    title = analytics.get("title", "")
    lines = [
        f'당신은 교육 데이터 분석 전문가입니다. 강의 "{title}"의 슬라이드별 수강생 반응 데이터를 분석해주세요.\n',
        "각 슬라이드에 대해 아래 항목을 분석하고 **JSON만** 응답하세요 (설명 텍스트 없이).\n",
        "응답 JSON 스키마:",
        '{"slides": [{"slide_idx": N, "confusion_score": 0.0~1.0, "core_concepts": ["개념1", ...],',
        ' "recommended_action": "enhance_script|add_slide|add_example|no_action",',
        ' "cqi_instruction": "createLecture에서 이 슬라이드를 개선할 때 따라야 할 구체적 지시문"}]}\n',
        "confusion_score 산출 기준:",
        "· 어려움 비율이 높을수록 상승 (어려움 가중치 1.0, 보통 0.4, 쉬움 0.0)",
        "· 질문 수가 많을수록 상승 (슬라이드당 3건 이상이면 최대치)",
        "· 재생 행동 시그널도 함께 고려:",
        "    - seek_back/replay/pause 가 많으면 어려움 신호 (학습자가 되돌리거나 멈춤)",
        "    - seek_forward 가 많으면 흥미·이해도 저하 신호일 수 있음 (학습자가 건너뜀)",
        "    - speed_change 1회 정도는 무시, 반복적 감속은 어려움 신호",
        "· 체크포인트 퀴즈가 있으면 가장 강한 시그널:",
        "    - 정답률 < 0.5 → confusion 매우 높음 (>= 0.7)",
        "    - 정답률 0.5~0.75 → 중간 어려움",
        "    - 정답률 >= 0.75 → 잘 이해된 상태 (다른 시그널과 균형)",
        "    - 특정 오답에 응답이 집중되면 그 오답이 학생의 흔한 오개념 — core_concepts와 cqi_instruction에 반영할 것",
        "· 데이터가 전혀 없으면 0.0\n",
        "recommended_action 기준:",
        "· enhance_script  : 기존 설명을 더 쉽게 풀어써야 할 때",
        "· add_slide       : 별도 슬라이드로 개념을 분리해야 할 때",
        "· add_example     : 구체적 예시나 시각화가 부족할 때",
        "· no_action       : confusion_score < 0.3 이고 질문이 없을 때\n",
        "cqi_instruction 작성 지침:",
        "· 학생 질문의 핵심 의도를 반영할 것",
        "· 무엇을 추가하거나 수정해야 하는지 구체적으로 서술할 것",
        "· 200자 이내 한국어로 작성할 것\n",
        "── 슬라이드 데이터 ──",
    ]

    for s in analytics.get("slides", []):
        idx = s["slide_idx"]
        diff = s.get("difficulty", {})
        total = diff.get("total", 0)
        kws = s.get("keywords", [])
        qs = s.get("questions", [])
        pb = s.get("playback_stats", {}) or {}

        lines.append(f"\n[슬라이드 {idx}]")
        if total > 0:
            lines.append(
                f"  난이도: 쉬움 {diff.get('쉬움', 0)}명, "
                f"보통 {diff.get('보통', 0)}명, "
                f"어려움 {diff.get('어려움', 0)}명 (총 {total}명)"
            )
        else:
            lines.append("  난이도: 평가 없음")

        if kws:
            kw_str = ", ".join(f"{k['keyword']}({k['count']})" for k in kws[:5])
            lines.append(f"  키워드: {kw_str}")
        else:
            lines.append("  키워드: 없음")

        if qs:
            lines.append(f"  질문 {len(qs)}건:")
            for q in qs[:10]:
                lines.append(f"    · {q['message']}")
        else:
            lines.append("  질문: 없음")

        pb_total = pb.get("total", 0)
        if pb_total > 0:
            lines.append(
                f"  재생 행동: 일시정지 {pb.get('pause', 0)}회, "
                f"되감기 {pb.get('seek_back', 0)}회, "
                f"건너뛰기 {pb.get('seek_forward', 0)}회, "
                f"다시보기 {pb.get('replay', 0)}회, "
                f"속도변경 {pb.get('speed_change', 0)}회"
            )
        else:
            lines.append("  재생 행동: 없음")

        qz = s.get("quiz_stats", {}) or {}
        qz_total = qz.get("total_responses", 0)
        if qz_total > 0:
            acc = qz.get("accuracy")
            acc_str = f"{int(round(acc * 100))}%" if isinstance(acc, (int, float)) else "?"
            dist = qz.get("option_distribution") or []
            ci   = qz.get("correct_index")
            dist_str = ", ".join(
                f"옵션{i+1}{'(정답)' if i == ci else ''}: {n}명"
                for i, n in enumerate(dist)
            )
            lines.append(
                f"  체크포인트 퀴즈: 응답 {qz_total}명, 정답률 {acc_str} ({qz.get('correct_count', 0)}명)"
            )
            if dist_str:
                lines.append(f"    응답 분포: {dist_str}")
        else:
            lines.append("  체크포인트 퀴즈: 없음")

    return "\n".join(lines)


async def run_analysis(report_id: str):
    """BackgroundTask: Claude API 호출 → DB 저장."""
    from ..database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        report = await db.get(CQIReport, report_id)
        if not report:
            return

        try:
            report.status = "processing"
            await db.commit()

            analytics = await fetch_analytics(report.lecture_id)
            prompt    = _build_prompt(analytics)

            message = await _anthropic.messages.create(
                model=CLAUDE_MODEL,
                max_tokens=4096,
                messages=[{"role": "user", "content": prompt}],
            )
            raw = message.content[0].text.strip()

            # JSON 블록만 추출
            if "```" in raw:
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            parsed = json.loads(raw)

            # analytics 원본 데이터를 보고서에 함께 저장
            full_report = {
                "lecture_id":   report.lecture_id,
                "lecture_title": report.lecture_title,
                "generated_at": report.generated_at,
                "slides": [],
            }
            analytics_by_idx = {s["slide_idx"]: s for s in analytics.get("slides", [])}
            covered_indices = set()
            for slide in parsed.get("slides", []):
                idx = slide["slide_idx"]
                covered_indices.add(idx)
                src = analytics_by_idx.get(idx, {})
                full_report["slides"].append({
                    **slide,
                    "difficulty":     src.get("difficulty", {}),
                    "keywords":       src.get("keywords",   []),
                    "questions":      src.get("questions",  []),
                    "playback_stats": src.get("playback_stats", {}),
                    "quiz_stats":     src.get("quiz_stats", {}),
                })

            # Add any analytics slides that Claude silently skipped
            for idx, src in sorted(analytics_by_idx.items()):
                if idx not in covered_indices:
                    full_report["slides"].append({
                        "slide_idx":          idx,
                        "confusion_score":    0.0,
                        "core_concepts":      [],
                        "recommended_action": "no_action",
                        "cqi_instruction":    "분석 데이터 없음.",
                        "difficulty":         src.get("difficulty", {}),
                        "keywords":           src.get("keywords",   []),
                        "questions":          src.get("questions",  []),
                        "playback_stats":     src.get("playback_stats", {}),
                        "quiz_stats":         src.get("quiz_stats", {}),
                    })

            # Sort final slides by slide_idx
            full_report["slides"].sort(key=lambda s: s["slide_idx"])

            report.report_json   = json.dumps(full_report, ensure_ascii=False)
            report.status        = "done"

        except Exception as exc:
            report.status        = "error"
            report.error_message = str(exc)

        await db.commit()


# ── API 엔드포인트 ────────────────────────────────────

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
    """프론트엔드용 외부 서비스 URL (deep-link 생성에 사용)."""
    return {
        "createlecture_url": _rehost(CREATELECTURE_URL, request),
        "playlecture_url": _rehost(PLAYLECTURE_URL, request),
    }


@router.get("/api/lectures")
async def list_lectures():
    """playLecture에서 강의 목록 조회."""
    try:
        return await fetch_lectures()
    except Exception as e:
        raise HTTPException(502, f"playLecture 연결 실패: {e}")


@router.post("/api/analyze/{lecture_id}", status_code=202)
async def start_analysis(
    lecture_id: str,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """분석 작업 시작 (비동기 백그라운드)."""
    # 이미 processing 중인 작업 중복 방지
    existing = await db.execute(
        select(CQIReport)
        .where(CQIReport.lecture_id == lecture_id, CQIReport.status == "processing")
    )
    if existing.scalars().first():
        raise HTTPException(409, "이미 분석이 진행 중입니다.")

    # 강의 존재 확인 + 제목 조회
    try:
        lectures = await fetch_lectures()
        match = next((l for l in lectures if l["id"] == lecture_id), None)
        if match is None:
            raise HTTPException(404, f"playLecture에서 강의를 찾을 수 없습니다: {lecture_id}")
        title = match["title"]
    except HTTPException:
        raise
    except Exception:
        title = lecture_id

    report = CQIReport(
        id            = str(uuid.uuid4()),
        lecture_id    = lecture_id,
        lecture_title = title,
        generated_at  = datetime.now(timezone.utc).isoformat(),
        status        = "pending",
    )
    db.add(report)
    await db.commit()

    background.add_task(run_analysis, report.id)
    return {"report_id": report.id, "status": "pending"}


@router.get("/api/reports")
async def list_reports(lecture_id: str = None, db: AsyncSession = Depends(get_db)):
    """저장된 CQI 보고서 목록. lecture_id 지정 시 해당 강의 이력만 (최신순)."""
    stmt = select(CQIReport).order_by(CQIReport.generated_at.desc())
    if lecture_id:
        stmt = stmt.where(CQIReport.lecture_id == lecture_id)
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [
        {
            "id":            r.id,
            "lecture_id":    r.lecture_id,
            "lecture_title": r.lecture_title,
            "generated_at":  r.generated_at,
            "status":        r.status,
            "error_message": r.error_message,
        }
        for r in rows
    ]


@router.get("/api/reports/{report_id}")
async def get_report(report_id: str, db: AsyncSession = Depends(get_db)):
    """CQI 보고서 상세 조회. createLecture에서 강의의 course/week를 조회해 함께 반환."""
    report = await db.get(CQIReport, report_id)
    if not report:
        raise HTTPException(404, "보고서를 찾을 수 없습니다.")
    report_obj = json.loads(report.report_json) if report.report_json else None

    # 강의 제작 페이지로 redirect 시 course+week+week_title 필터·컨텍스트가
    # 동작하도록 보강. 보고서 JSON 자체에 들어 있지 않으면 createLecture에서
    # lecture_id로 조회한다.
    if report_obj is not None and (
        not report_obj.get("course") or
        not report_obj.get("week") or
        not report_obj.get("week_title")
    ):
        ctx = await fetch_lecture_context(report.lecture_id)
        if ctx.get("course"):     report_obj["course"]     = ctx["course"]
        if ctx.get("week"):       report_obj["week"]       = ctx["week"]
        if ctx.get("week_title"): report_obj["week_title"] = ctx["week_title"]

    return {
        "id":            report.id,
        "lecture_id":    report.lecture_id,
        "lecture_title": report.lecture_title,
        "generated_at":  report.generated_at,
        "status":        report.status,
        "error_message": report.error_message,
        "report":        report_obj,
    }


@router.delete("/api/reports/{report_id}", status_code=204)
async def delete_report(report_id: str, db: AsyncSession = Depends(get_db)):
    report = await db.get(CQIReport, report_id)
    if not report:
        raise HTTPException(404, "보고서를 찾을 수 없습니다.")
    await db.delete(report)
    await db.commit()


# ── 주차별 분석 API ───────────────────────────────────

@router.get("/api/week-lectures")
async def get_week_lectures(course: str, week: str, db: AsyncSession = Depends(get_db)):
    """특정 course+week의 강의 목록과 분석 상태 반환."""
    try:
        lectures = await fetch_week_lectures(course, week)
    except Exception as e:
        raise HTTPException(502, f"createLecture 연결 실패: {e}")

    if not lectures:
        return []

    # DB에서 모든 보고서 조회 → 강의별 이력(최신순)으로 그룹화
    result_rows = await db.execute(select(CQIReport).order_by(CQIReport.generated_at.desc()))
    all_reports = result_rows.scalars().all()
    reports_by_lecture: dict[str, list[CQIReport]] = {}
    for r in all_reports:
        reports_by_lecture.setdefault(r.lecture_id, []).append(r)

    result = []
    for lec in lectures:
        lid = lec["lecture_id"]
        history = reports_by_lecture.get(lid, [])
        report = history[0] if history else None   # 최신
        result.append({
            "lecture_id":          lid,
            "title":               lec.get("title", lid),
            "slide_count":         lec.get("slide_count", 0),
            "segment_count":       lec.get("segment_count", 0),
            "created_at":          lec.get("created_at", ""),
            "analyze_status":      report.status if report else None,
            "report_id":           report.id if report else None,
            "report_generated_at": report.generated_at if report else None,
            "error_message":       report.error_message if report else None,
            # 강의별 전체 분석 이력 (최신순) — 날짜 선택용
            "reports": [
                {
                    "report_id":    rr.id,
                    "generated_at": rr.generated_at,
                    "status":       rr.status,
                }
                for rr in history
            ],
        })
    return result


@router.post("/api/analyze-week", status_code=202)
async def start_week_analysis(
    course: str,
    week: str,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """course+week에 속한 모든 강의에 대해 분석 시작."""
    try:
        lectures = await fetch_week_lectures(course, week)
    except Exception as e:
        raise HTTPException(502, f"createLecture 연결 실패: {e}")

    if not lectures:
        raise HTTPException(404, f"강의를 찾을 수 없습니다. (course={course}, week={week})")

    results = []
    for lec in lectures:
        lid   = lec["lecture_id"]
        title = lec.get("title", lid)

        # 이미 processing 중인 작업 중복 방지
        existing = await db.execute(
            select(CQIReport)
            .where(CQIReport.lecture_id == lid, CQIReport.status == "processing")
        )
        if existing.scalars().first():
            results.append({"lecture_id": lid, "status": "already_processing"})
            continue

        # playLecture 자동 임포트 트리거
        await ensure_play_imported(lid)

        report = CQIReport(
            id=str(uuid.uuid4()),
            lecture_id=lid,
            lecture_title=title,
            generated_at=datetime.now(timezone.utc).isoformat(),
            status="pending",
        )
        db.add(report)
        await db.commit()

        background.add_task(run_analysis, report.id)
        results.append({"lecture_id": lid, "report_id": report.id, "status": "pending"})

    return results
