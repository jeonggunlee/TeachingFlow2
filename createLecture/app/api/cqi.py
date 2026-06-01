"""CQI 사이클 자동화 — analyzeLecture에서 CQI 보고서를 가져와 createLecture에 적용.

기존에는 사용자가 analyzeLecture에서 JSON을 다운로드 → createLecture에서 업로드해야 했지만,
이 모듈은 그 단계를 제거하고 두 서비스가 직접 통신하도록 한다.

엔드포인트:
- GET /api/cqi-reports?course=&week=   : 현재 컨텍스트에 해당하는 보고서 목록
- GET /api/cqi-reports/{report_id}     : 단일 보고서 JSON (report 본문만)
"""
import json
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from app.config import settings
from app.utils.storage import lecture_dir

router = APIRouter(prefix="/api", tags=["cqi"])


def _read_meta(lid: str) -> dict:
    """createLecture 자신의 storage에서 lecture_id로 meta.json 읽음 (course/week 조회용)."""
    base = lecture_dir(lid)
    p = base / "meta.json"
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {}


@router.get("/cqi-reports")
async def list_cqi_reports(course: str = "", week: str = "", limit: int = 20):
    """analyzeLecture의 보고서 목록을 가져와 course/week로 필터링해 반환.

    analyzeLecture의 GET /api/reports는 course/week 정보를 직접 갖고 있지 않으므로,
    각 보고서의 lecture_id를 사용해 createLecture 자신의 meta.json에서 컨텍스트를 조회한다.
    """
    base_url = settings.analyzelecture_url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(f"{base_url}/api/reports")
            res.raise_for_status()
            reports = res.json()
    except httpx.RequestError as e:
        raise HTTPException(502, f"analyzeLecture 연결 실패: {type(e).__name__}")
    except httpx.HTTPStatusError as e:
        raise HTTPException(502, f"analyzeLecture 응답 오류: {e.response.status_code}")

    if not isinstance(reports, list):
        return JSONResponse([])

    # 각 보고서에 course/week를 createLecture meta에서 보강 + 필터링
    out = []
    for r in reports:
        lid = r.get("lecture_id", "")
        if not lid:
            continue
        meta = _read_meta(lid)
        r_course = meta.get("course", "")
        r_week = str(meta.get("week", ""))

        # 필터 적용 (전달된 경우만)
        if course and r_course != course:
            continue
        if week and r_week != str(week):
            continue

        out.append({
            "report_id": r.get("id"),
            "lecture_id": lid,
            "lecture_title": r.get("lecture_title", ""),
            "generated_at": r.get("generated_at", ""),
            "status": r.get("status", ""),
            "error_message": r.get("error_message"),
            "course": r_course,
            "week": r_week,
        })

        if len(out) >= max(1, min(limit, 100)):
            break

    return JSONResponse(out)


@router.get("/cqi-reports/{report_id}")
async def get_cqi_report(report_id: str):
    """analyzeLecture에서 단일 보고서 fetch.

    응답: { "report": {...}, "status": "...", "lecture_title": "..." }
    프론트엔드의 formatCqiReport()와 호환되도록 report.html이 다운로드하는
    형식(`report` 본문만)으로도, GET /api/reports/{id}의 원본 형식으로도
    파싱 가능하게 그대로 전달한다.
    """
    base_url = settings.analyzelecture_url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.get(f"{base_url}/api/reports/{report_id}")
            if res.status_code == 404:
                raise HTTPException(404, "보고서를 찾을 수 없습니다.")
            res.raise_for_status()
            data = res.json()
    except HTTPException:
        raise
    except httpx.RequestError as e:
        raise HTTPException(502, f"analyzeLecture 연결 실패: {type(e).__name__}")
    except httpx.HTTPStatusError as e:
        raise HTTPException(502, f"analyzeLecture 응답 오류: {e.response.status_code}")

    return JSONResponse(data)
