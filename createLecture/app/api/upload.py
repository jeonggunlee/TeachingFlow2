"""강의 생성 파이프라인 — 웹 슬라이드 전용.

교수자 프롬프트 → Claude가 슬라이드 아웃라인 설계 → HTML+CSS로 직접 렌더(PNG)
→ Vision 분석 → (CQI 반영) → 스크립트 편집 → TTS → lecture.json

PPT(.pptx) 업로드 경로는 제거되었다. 슬라이드는 항상 `outline.json`(구조화된
스펙)에서 렌더되므로, CQI로 슬라이드 자체를 진화시킬 수 있고 버전이 바뀌어도
`design.json`으로 시각 디자인이 유지된다.
"""
import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Form, HTTPException
from fastapi.responses import JSONResponse

from app.config import settings
from app.services.lecture_builder import build as build_lecture
from app.services.segment_writer import write_all as write_segments
from app.services.slide_spec import load as load_outline
from app.services.tts_synthesizer import synthesize_all
from app.utils import sse
from app.utils.storage import ensure_lecture_dirs, lecture_dir, lecture_id_from_path, new_lecture_id

router = APIRouter(prefix="/api", tags=["upload"])

# 단계별 진행률 범위
_PROG_P1 = {
    "generate": (0,  22),   # 프롬프트 → 슬라이드 설계·렌더
    "analyze":  (22, 68),   # Vision 분석 (슬라이드별)
    "cqi":      (68, 80),   # CQI 적용 (있을 때)
}

_PROG_P2 = {
    "tts":   (5,  85),   # TTS 합성 (세그먼트별)
    "build": (85, 95),
}


async def _run_pipeline_phase1(base: Path, lecture_id: str, cqi_text: str = "") -> None:
    """Phase 1 후반: 아웃라인 → 내레이션 작성 → (CQI 적용) → scripts_ready."""
    err_path = base / "job.err"

    async def progress(label: str, pct: int):
        await sse.push(lecture_id, "progress", label=label, progress=pct)

    outline = load_outline(base)
    if not outline:
        await sse.push(lecture_id, "job_error", message="슬라이드 아웃라인이 없습니다.")
        return

    n_slides = len(outline)
    lo, hi = _PROG_P1["analyze"]

    # ── 내레이션 작성 (요소 id 기반 — 좌표 추측 없음) ────────────────
    await sse.push(lecture_id, "step",
                   label=f"강의 내레이션 작성 중 ({n_slides}장)...", progress=lo)

    async def on_slide_done(done: int, total: int):
        pct = int(lo + (done / max(total, 1)) * (hi - lo))
        await progress(f"내레이션 작성 중 ({done}/{total})...", pct)

    try:
        vision = await write_segments(outline, base, on_progress=on_slide_done)
    except Exception as e:
        err_path.write_text(f"write_segments: {e}\n", encoding="utf-8")
        await sse.push(lecture_id, "job_error", message=f"내레이션 작성 오류: {e}")
        return

    # ── CQI 적용 (선택) ──────────────────────────────────────────────
    if cqi_text and cqi_text.strip():
        (base / "cqi.txt").write_text(cqi_text, encoding="utf-8")

        lo_c, hi_c = _PROG_P1["cqi"]
        await sse.push(lecture_id, "step", label="CQI 피드백 반영 중...", progress=lo_c)
        try:
            from app.services.cqi_adapter import apply as apply_cqi
            # 슬라이드에 실제로 그려진 내용을 함께 전달
            improved = await apply_cqi(vision, cqi_text, outline=outline)
            vision_dir = base / "vision"
            for slide_data in improved:
                idx = slide_data.get("slide_index", 0)
                (vision_dir / f"slide_{idx:03d}.json").write_text(
                    json.dumps(slide_data, ensure_ascii=False, indent=2), encoding="utf-8",
                )
        except Exception as e:
            # CQI 반영 실패는 치명적이지 않음 — Vision 결과로 계속 진행
            err_path.write_text(f"apply_cqi(non-fatal): {e}\n", encoding="utf-8")
        await progress("CQI 피드백 반영 완료", hi_c)

    await sse.push(lecture_id, "scripts_ready", lecture_id=lecture_id, progress=85)


async def _run_pipeline_from_prompt(
    prompt: str,
    num_slides: Optional[int],
    base: Path,
    lecture_id: str,
    cqi_text: str = "",
) -> None:
    """프롬프트 → 슬라이드 아웃라인 설계 → HTML+CSS 렌더(PNG) → Phase1 후반 실행."""
    err_path = base / "job.err"
    lo_g, hi_g = _PROG_P1["generate"]

    await sse.push(lecture_id, "step",
                   label="프롬프트로 슬라이드 디자인 중...", progress=lo_g + 1)

    async def on_slide_rendered(done: int, total: int):
        pct = int(lo_g + (done / max(total, 1)) * (hi_g - lo_g))
        await sse.push(lecture_id, "progress",
                       label=f"슬라이드 렌더링 중 ({done}/{total})...",
                       progress=max(pct, lo_g + 1))

    try:
        from app.services.slide_renderer import generate as generate_slides
        await generate_slides(
            prompt, base,
            num_slides=num_slides,
            on_progress=on_slide_rendered,
        )
    except Exception as e:
        err_path.write_text(f"generate_slides: {e}\n", encoding="utf-8")
        await sse.push(lecture_id, "job_error", message=f"슬라이드 생성 오류: {e}")
        return

    await sse.push(lecture_id, "progress", label="슬라이드 디자인 완료", progress=hi_g)

    await _run_pipeline_phase1(base, lecture_id, cqi_text)


async def _run_pipeline_phase2(base: Path, lecture_id: str) -> None:
    """Phase 2: vision JSON → TTS 합성 → lecture.json 빌드 → done 이벤트."""
    err_path = base / "job.err"

    async def step(stage: str, label: str, pct=None):
        lo = _PROG_P2[stage][0]
        if pct is None:
            pct = lo
        await sse.push(lecture_id, "step", label=label, progress=pct)

    async def progress(label: str, pct: int):
        await sse.push(lecture_id, "progress", label=label, progress=pct)

    # ── vision 결과 로드 ─────────────────────────────────────────────
    vision_dir = base / "vision"
    vision = []
    for vpath in sorted(vision_dir.glob("slide_*.json")):
        try:
            vision.append(json.loads(vpath.read_text(encoding="utf-8")))
        except Exception as e:
            err_path.write_text(f"vision_load: {e}\n", encoding="utf-8")
            await sse.push(lecture_id, "job_error", message=f"vision 로드 오류: {e}")
            return

    if not vision:
        await sse.push(lecture_id, "job_error", message="vision 데이터가 없습니다.")
        return

    # ── TTS 합성 ─────────────────────────────────────────────────────
    total_segs = sum(len(s.get("segments", [])) for s in vision)
    lo_t, hi_t = _PROG_P2["tts"]
    await step("tts", f"음성 합성 시작 ({total_segs}개 세그먼트)...", lo_t)

    done_segs = [0]

    async def on_seg_done():
        done_segs[0] += 1
        pct = int(lo_t + (done_segs[0] / max(total_segs, 1)) * (hi_t - lo_t))
        await progress(f"음성 합성 중 ({done_segs[0]}/{total_segs})...", pct)

    try:
        await synthesize_all(vision, base, force=True, on_progress=on_seg_done)
    except Exception as e:
        err_path.write_text(f"synthesize_all: {e}\n", encoding="utf-8")
        await sse.push(lecture_id, "job_error", message=f"음성 합성 오류: {e}")
        return

    # ── lecture.json 빌드 ─────────────────────────────────────────────
    await step("build", "강의 메타데이터 빌드 중...", _PROG_P2["build"][0])
    try:
        build_lecture(lecture_id_from_path(base), base)
    except Exception as e:
        err_path.write_text(f"build_lecture: {e}\n", encoding="utf-8")
        await sse.push(lecture_id, "job_error", message=f"빌드 오류: {e}")
        return

    await sse.push(lecture_id, "done", lecture_id=lecture_id, progress=100)


@router.post("/upload-prompt")
async def upload_from_prompt(
    background: BackgroundTasks,
    prompt: str = Form(...),
    num_slides: str = Form(""),
    cqi: str = Form(""),
    course: str = Form(""),
    week: str = Form(""),
    week_title: str = Form(""),
):
    """교수자 프롬프트로 웹 슬라이드를 생성한 뒤 강의 파이프라인을 실행한다."""
    prompt_clean = (prompt or "").strip()
    if len(prompt_clean) < 10:
        raise HTTPException(400, "프롬프트가 너무 짧습니다 (최소 10자 이상)")

    num_slides_val: Optional[int] = None
    if num_slides.strip():
        try:
            num_slides_val = int(num_slides.strip())
        except ValueError:
            raise HTTPException(400, "num_slides 는 정수여야 합니다")
        if num_slides_val < 3 or num_slides_val > 30:
            raise HTTPException(400, "num_slides 는 3~30 범위여야 합니다")

    lecture_id = new_lecture_id()
    base = ensure_lecture_dirs(lecture_id)

    # 포털 컨텍스트 저장 (강의 제목 조합 + "최근 프롬프트" 목록에서 사용)
    (base / "meta.json").write_text(
        json.dumps({
            "course": course,
            "week": week,
            # 진화(evolve)가 Claude에게 "이 강의가 무엇에 대한 것인지" 알려줄 때 쓴다.
            # 없으면 교과목명이 강의 제목 자리에 들어가 엉뚱한 맥락이 전달된다.
            "week_title": week_title,
            "source_type": "prompt",
            "num_slides_requested": num_slides_val,
        }, ensure_ascii=False),
        encoding="utf-8",
    )

    # SSE 큐를 응답 전에 생성 — 클라이언트가 구독하기 전 이벤트 손실 방지
    sse.init(lecture_id)
    background.add_task(
        _run_pipeline_from_prompt,
        prompt_clean, num_slides_val, base, lecture_id, cqi,
    )

    return {
        "lecture_id": lecture_id,
        "mode": "prompt",
        "num_slides_requested": num_slides_val,
    }


def _read_meta(base: Path) -> dict:
    p = base / "meta.json"
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {}


@router.get("/recent-uploads")
async def list_recent_uploads(limit: int = 10):
    """최근 사용한 강의 프롬프트 목록 (강의 디렉터리 mtime 기준 최신순)."""
    root = settings.storage_root / "lectures"
    if not root.exists():
        return JSONResponse([])

    items = []
    for lpath in sorted(root.iterdir(),
                        key=lambda p: p.stat().st_mtime if p.exists() else 0,
                        reverse=True):
        if not lpath.is_dir():
            continue
        prompt_path = lpath / "prompt.txt"
        if not prompt_path.exists():
            continue
        try:
            text = prompt_path.read_text(encoding="utf-8")
        except Exception:
            continue

        meta = _read_meta(lpath)
        items.append({
            "lecture_id": lpath.name,
            "prompt_text": text,
            "num_slides": meta.get("num_slides_requested"),
            "course": meta.get("course", ""),
            "week": meta.get("week", ""),
            "created_at": lpath.stat().st_mtime,
        })

        if len(items) >= max(1, min(limit, 50)):
            break

    return JSONResponse(items)


@router.get("/lectures/{lecture_id}/status")
async def lecture_status(lecture_id: str):
    base = lecture_dir(lecture_id)
    if not base.exists():
        raise HTTPException(404, "lecture_id not found")
    # 웹 슬라이드는 .html 로 렌더된다 — .png 만 세면 항상 0이 나온다
    # (레거시 PNG 강의도 함께 세기 위해 두 확장자를 모두 확인).
    slides = (sorted((base / "slides").glob("slide_*.html"))
              or sorted((base / "slides").glob("slide_*.png")))
    vision = sorted((base / "vision").glob("slide_*.json"))
    audio  = sorted((base / "audio").glob("*.mp3"))
    err    = base / "job.err"
    return {
        "lecture_id": lecture_id,
        "slides_count": len(slides),
        "vision_count": len(vision),
        "audio_count":  len(audio),
        "has_lecture_json": (base / "lecture.json").exists(),
        "error": err.read_text(encoding="utf-8") if err.exists() else None,
    }
