"""CQI 진화 API — 누적 지시 관리(승인제) + 새 버전 생성.

흐름:
  1. analyzeLecture 보고서를 원장에 취입      POST /api/lectures/{id}/cqi-ledger/import
  2. 교수자가 항목을 검토·수정·승인            PATCH /api/lectures/{id}/cqi-ledger/{entry_id}
  3. 승인된 지시로 새 버전 생성                POST /api/lectures/{id}/evolve
       → 슬라이드 아웃라인 진화 → 같은 디자인으로 재렌더 → Vision 재분석
       → 내레이션에 누적 CQI 반영 → scripts_ready

새 버전은 새 lecture_id를 갖고 부모를 meta.json에 기록한다(계보 보존).
"""
import json
import shutil
from pathlib import Path

import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import JSONResponse

from app.config import settings
from app.services import cqi_ledger, design_spec, slide_spec
from app.utils import sse
from app.utils.storage import (
    ensure_lecture_dirs,
    lecture_dir,
    lineage_members,
    lineage_of,
    new_lecture_id,
    read_meta,
    version_of,
    write_meta,
)

router = APIRouter(prefix="/api", tags=["evolve"])


def _require(lecture_id: str) -> Path:
    base = lecture_dir(lecture_id)
    if not base.exists():
        raise HTTPException(404, "lecture_id not found")
    return base


# ── 누적 원장 ────────────────────────────────────────────────────────

@router.get("/lectures/{lecture_id}/cqi-ledger")
async def get_ledger(lecture_id: str):
    base = _require(lecture_id)
    ledger = cqi_ledger.load(base)
    return JSONResponse({
        "lecture_id": lecture_id,
        "lineage_id": lineage_of(lecture_id),
        "version":    version_of(lecture_id),
        "stats":      cqi_ledger.stats(ledger),
        "entries":    ledger.get("entries", []),
        "preview_prompt": cqi_ledger.to_prompt(ledger),
    })


@router.post("/lectures/{lecture_id}/cqi-ledger/import")
async def import_from_report(lecture_id: str, request: Request):
    """analyzeLecture 보고서를 원장에 pending으로 취입."""
    base = _require(lecture_id)
    payload = await request.json()
    report_id = (payload.get("report_id") or "").strip()
    if not report_id:
        raise HTTPException(400, "report_id가 필요합니다.")

    url = f"{settings.analyzelecture_url.rstrip('/')}/api/reports/{report_id}"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.get(url)
            if res.status_code == 404:
                raise HTTPException(404, "보고서를 찾을 수 없습니다.")
            res.raise_for_status()
            data = res.json()
    except HTTPException:
        raise
    except httpx.RequestError as e:
        raise HTTPException(502, f"analyzeLecture 연결 실패: {type(e).__name__}")

    report = data.get("report") or data
    if not isinstance(report, dict) or not report.get("slides"):
        raise HTTPException(400, "분석이 완료된 보고서가 아닙니다.")

    added = cqi_ledger.import_report(
        base, report,
        from_lecture_id=data.get("lecture_id", ""),
        report_id=report_id,
        cycle=version_of(lecture_id),
    )
    return JSONResponse({"added": len(added), "entries": added})


@router.post("/lectures/{lecture_id}/cqi-ledger")
async def add_entry(lecture_id: str, request: Request):
    """교수자가 직접 지시문 추가 (즉시 승인 상태로 넣을 수도 있음)."""
    base = _require(lecture_id)
    payload = await request.json()
    text = (payload.get("instruction") or "").strip()
    if not text:
        raise HTTPException(400, "instruction이 비어 있습니다.")

    entry = cqi_ledger.add(
        base, text,
        source="manual",
        slide_ref=payload.get("slide_ref") or {},
        cycle=version_of(lecture_id),
        status=(cqi_ledger.STATUS_APPROVED if payload.get("approved")
                else cqi_ledger.STATUS_PENDING),
    )
    return JSONResponse(entry)


@router.patch("/lectures/{lecture_id}/cqi-ledger/{entry_id}")
async def patch_entry(lecture_id: str, entry_id: str, request: Request):
    """승인 / 폐기 / 문구 수정 / 대체 표시."""
    base = _require(lecture_id)
    payload = await request.json()

    entry = None
    if "instruction" in payload:
        entry = cqi_ledger.update_instruction(base, entry_id, payload["instruction"])
    if payload.get("supersedes"):
        cqi_ledger.supersede(base, payload["supersedes"], entry_id)
    if "status" in payload:
        status = payload["status"]
        if status not in (cqi_ledger.STATUS_PENDING, cqi_ledger.STATUS_APPROVED,
                          cqi_ledger.STATUS_DISCARDED, cqi_ledger.STATUS_SUPERSEDED):
            raise HTTPException(400, f"알 수 없는 status: {status}")
        entry = cqi_ledger.set_status(base, entry_id, status)

    if entry is None:
        raise HTTPException(404, "항목을 찾을 수 없습니다.")
    return JSONResponse(entry)


# ── 계보 ─────────────────────────────────────────────────────────────

@router.get("/lectures/{lecture_id}/lineage")
async def get_lineage(lecture_id: str):
    _require(lecture_id)
    lid = lineage_of(lecture_id)
    return JSONResponse({
        "lineage_id": lid,
        "current":    lecture_id,
        "versions":   lineage_members(lid),
    })


# ── 진화 실행 ────────────────────────────────────────────────────────

_PROG = {
    "spec":    (3,  15),   # 현재 슬라이드 스펙 확보
    "evolve":  (15, 35),   # 아웃라인 진화
    "render":  (35, 55),   # 슬라이드 재렌더
    "vision":  (55, 78),   # Vision 재분석
    "cqi":     (78, 92),   # 내레이션에 누적 CQI 반영
}


async def _run_evolution(parent_id: str, new_id: str) -> None:
    """부모 버전 → 진화된 새 버전 생성 파이프라인."""
    from app.services.cqi_evolver import evolve_outline
    from app.services.slide_renderer import render_outline
    from app.services.vision_analyzer import analyze_all as analyze_slides

    parent = lecture_dir(parent_id)
    base   = lecture_dir(new_id)
    err    = base / "job.err"

    async def push(event, **kw):
        await sse.push(new_id, event, **kw)

    async def step(stage, label):
        await push("step", label=label, progress=_PROG[stage][0])

    try:
        design = design_spec.load(base)
        ledger = cqi_ledger.load(base)
        instructions = cqi_ledger.to_prompt(ledger)
        if not instructions:
            await push("job_error", message="승인된 CQI 지시가 없습니다.")
            return

        # ── 1. 현재 슬라이드 스펙 확보 (PPT 강의는 Vision으로 역추출) ──
        await step("spec", "현재 강의의 페이지별 내용 확인 중...")
        lo, hi = _PROG["spec"]

        async def on_spec(done, total):
            pct = int(lo + (done / max(total, 1)) * (hi - lo))
            await push("progress", label=f"슬라이드 내용 추출 중 ({done}/{total})...",
                       progress=pct)

        # 새 버전 디렉터리는 아직 비어 있으므로 **부모 버전**에서 스펙을 얻는다.
        # PPT로 만든 강의는 outline.json이 없으므로 부모의 슬라이드 이미지에서
        # Vision으로 역추출하고, 그 결과를 부모에 캐시해 다음 진화 때 재사용한다.
        outline = await slide_spec.ensure(parent, on_progress=on_spec)

        # ── 2. 누적 CQI로 아웃라인 진화 ──────────────────────────────
        await step("evolve", "누적 CQI를 반영해 슬라이드 구성 개선 중...")
        meta = read_meta(new_id)
        parent_vision = []
        for vp in sorted((parent / "vision").glob("slide_*.json")):
            try:
                parent_vision.append(json.loads(vp.read_text(encoding="utf-8")))
            except Exception:
                pass

        evolved = await evolve_outline(
            outline, instructions,
            design=design,
            vision=parent_vision,
            lecture_title=meta.get("week_title") or meta.get("course", ""),
        )
        if not evolved:
            await push("job_error", message="진화 결과가 비어 있습니다.")
            return

        (base / "outline.json").write_text(
            json.dumps(evolved, ensure_ascii=False, indent=2), encoding="utf-8",
        )

        # ── 3. 같은 디자인으로 슬라이드 재렌더 ───────────────────────
        await step("render", f"슬라이드 재생성 중 ({len(evolved)}장)...")
        lo_r, hi_r = _PROG["render"]

        async def on_render(done, total):
            pct = int(lo_r + (done / max(total, 1)) * (hi_r - lo_r))
            await push("progress", label=f"슬라이드 렌더링 ({done}/{total})...", progress=pct)

        # 이전 슬라이드 잔여 파일 제거 (장수가 줄어들 수 있음)
        slides_dir = base / "slides"
        if slides_dir.exists():
            shutil.rmtree(slides_dir)
        slides_dir.mkdir(parents=True, exist_ok=True)

        slide_paths = await render_outline(
            evolved, base, design=design, on_progress=on_render,
        )

        # ── 4. Vision 재분석 (새 슬라이드에 맞는 내레이션·강조 좌표) ──
        await step("vision", f"새 슬라이드 AI 분석 중 ({len(slide_paths)}장)...")
        lo_v, hi_v = _PROG["vision"]
        seen = [0]

        async def on_slide(idx):
            seen[0] += 1
            pct = int(lo_v + (seen[0] / max(len(slide_paths), 1)) * (hi_v - lo_v))
            await push("progress", label=f"슬라이드 분석 중 ({seen[0]}/{len(slide_paths)})...",
                       progress=pct)

        vision = await analyze_slides(slide_paths, base, force=True, on_progress=on_slide)

        # ── 5. 내레이션에 누적 CQI 반영 ──────────────────────────────
        await step("cqi", "누적 CQI를 강의 설명에 반영 중...")
        try:
            from app.services.cqi_adapter import apply as apply_cqi
            improved = await apply_cqi(vision, instructions, outline=evolved)
            vdir = base / "vision"
            for sd in improved:
                idx = sd.get("slide_index", 0)
                (vdir / f"slide_{idx:03d}.json").write_text(
                    json.dumps(sd, ensure_ascii=False, indent=2), encoding="utf-8",
                )
        except Exception as e:
            # 내레이션 보강 실패는 치명적이지 않음 — Vision 결과로 계속 진행
            err.write_text(f"apply_cqi(non-fatal): {e}\n", encoding="utf-8")

        (base / "cqi.txt").write_text(instructions, encoding="utf-8")
        await push("scripts_ready", lecture_id=new_id, progress=80)

    except Exception as e:
        err.write_text(f"evolve: {e}\n", encoding="utf-8")
        await push("job_error", message=f"진화 오류: {e}")


@router.post("/lectures/{lecture_id}/evolve")
async def evolve(lecture_id: str, background: BackgroundTasks):
    """승인된 누적 CQI를 반영한 **새 버전**을 만든다."""
    parent = _require(lecture_id)

    ledger = cqi_ledger.load(parent)
    if not cqi_ledger.active(ledger):
        raise HTTPException(
            400, "승인된 CQI 지시가 없습니다. 먼저 지시문을 검토·승인해주세요."
        )

    parent_meta = read_meta(lecture_id)
    lineage_id  = lineage_of(lecture_id)
    new_version = version_of(lecture_id) + 1

    new_id = new_lecture_id()
    base   = ensure_lecture_dirs(new_id)
    (base / "vision").mkdir(parents=True, exist_ok=True)

    # 계보·컨텍스트 승계
    write_meta(new_id, {
        **{k: parent_meta.get(k) for k in
           ("course", "week", "week_title", "original_filename") if parent_meta.get(k)},
        "source_type":       "evolved",
        "lineage_id":        lineage_id,
        "version":           new_version,
        "parent_lecture_id": lecture_id,
    })

    # 디자인 고정 + 누적 원장 승계
    design_spec.carry(parent, base)
    cqi_ledger.carry(parent, base, new_cycle=new_version)

    sse.init(new_id)
    background.add_task(_run_evolution, lecture_id, new_id)

    return JSONResponse({
        "lecture_id": new_id,
        "parent_lecture_id": lecture_id,
        "lineage_id": lineage_id,
        "version": new_version,
    }, status_code=202)
