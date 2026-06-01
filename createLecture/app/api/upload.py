import json
import shutil
from pathlib import Path
from typing import Optional

import aiofiles
from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from app.config import settings
from app.services.lecture_builder import build as build_lecture
from app.services.ppt_to_images import convert as convert_to_images
from app.services.tts_synthesizer import synthesize_all
from app.services.vision_analyzer import analyze_all as analyze_slides
from app.utils import sse
from app.utils.storage import ensure_lecture_dirs, lecture_dir, lecture_id_from_path, new_lecture_id

router = APIRouter(prefix="/api", tags=["upload"])

ALLOWED_EXT = {".ppt", ".pptx"}
CHUNK = 1024 * 1024

# 단계별 진행률 범위
_PROG_P1 = {
    "generate": (0,  5),    # 프롬프트 → PPT 자동 생성 (선택)
    "convert":  (5,  20),   # PPT → 이미지
    "analyze":  (20, 65),   # Vision 분석 (슬라이드별)
    "cqi":      (65, 78),   # CQI 적용 (있을 때)
}

_PROG_P2 = {
    "tts":   (5,  85),   # TTS 합성 (세그먼트별)
    "build": (85, 95),
}


async def _run_pipeline_phase1(pptx_path: Path, base: Path, lecture_id: str, cqi_text: str = "") -> None:
    """Phase 1: PPT → 이미지 → Vision 분석 → (CQI 적용) → scripts_ready 이벤트."""
    err_path = base / "job.err"

    async def step(stage: str, label: str, pct=None):
        lo = _PROG_P1[stage][0]
        if pct is None:
            pct = lo
        await sse.push(lecture_id, "step", label=label, progress=pct)

    async def progress(label: str, pct: int):
        await sse.push(lecture_id, "progress", label=label, progress=pct)

    # ── 1. PPT → 이미지 ─────────────────────────────────────────────
    await step("convert", "PPT → 슬라이드 이미지 변환 중...")
    try:
        slides = await convert_to_images(pptx_path, base)
    except Exception as e:
        err_path.write_text(f"convert_to_images: {e}\n", encoding="utf-8")
        await sse.push(lecture_id, "job_error", message=f"이미지 변환 오류: {e}")
        return

    n_slides = len(slides)
    lo, hi = _PROG_P1["analyze"]

    # ── 2. Vision 분석 ───────────────────────────────────────────────
    await step("analyze", f"AI 슬라이드 분석 시작 ({n_slides}장)...", lo)

    completed = [0]

    async def on_slide_done(idx: int):
        completed[0] += 1
        pct = int(lo + (completed[0] / n_slides) * (hi - lo))
        await progress(f"슬라이드 분석 중 ({completed[0]}/{n_slides})...", pct)

    try:
        vision = await analyze_slides(slides, base, on_progress=on_slide_done)
    except Exception as e:
        err_path.write_text(f"analyze_slides: {e}\n", encoding="utf-8")
        await sse.push(lecture_id, "job_error", message=f"슬라이드 분석 오류: {e}")
        return

    # ── 3. CQI 적용 (선택) ──────────────────────────────────────────
    if cqi_text and cqi_text.strip():
        # CQI 텍스트를 파일로 저장
        (base / "cqi.txt").write_text(cqi_text, encoding="utf-8")

        lo_c, hi_c = _PROG_P1["cqi"]
        await step("cqi", "CQI 피드백 반영 중...", lo_c)
        try:
            from app.services.cqi_adapter import apply as apply_cqi
            improved = await apply_cqi(vision, cqi_text)
            # 개선된 결과를 vision JSON 파일에 다시 저장
            vision_dir = base / "vision"
            for slide_data in improved:
                idx = slide_data.get("slide_index", 0)
                out_path = vision_dir / f"slide_{idx:03d}.json"
                out_path.write_text(json.dumps(slide_data, ensure_ascii=False, indent=2), encoding="utf-8")
            vision = improved
        except Exception as e:
            err_path.write_text(f"apply_cqi: {e}\n", encoding="utf-8")
            await sse.push(lecture_id, "job_error", message=f"CQI 적용 오류: {e}")
            return
        await progress("CQI 피드백 반영 완료", hi_c)

    # ── 4. scripts_ready 이벤트 발행 ────────────────────────────────
    await sse.push(lecture_id, "scripts_ready", lecture_id=lecture_id, progress=80)


async def _run_pipeline_from_prompt(
    prompt: str,
    num_slides: Optional[int],
    base: Path,
    lecture_id: str,
    cqi_text: str = "",
) -> None:
    """프롬프트 → HTML+CSS 슬라이드 PNG 직접 생성 → 기존 Phase1 파이프라인 실행.

    .pptx 파일은 생성하지 않고 Playwright로 슬라이드 PNG를 직접 만든다.
    이후 _run_pipeline_phase1의 convert 단계는 slides/ 캐시를 그대로 사용한다.
    """
    err_path = base / "job.err"
    lo_g, hi_g = _PROG_P1["generate"]

    await sse.push(
        lecture_id, "step",
        label="프롬프트로 슬라이드 디자인 중...",
        progress=lo_g + 1,
    )

    async def on_slide_rendered(done: int, total: int):
        # generate 범위 안에서 슬라이드별 진행률 표시
        pct = int(lo_g + (done / max(total, 1)) * (hi_g - lo_g))
        await sse.push(
            lecture_id, "progress",
            label=f"슬라이드 렌더링 중 ({done}/{total})...",
            progress=max(pct, lo_g + 1),
        )

    try:
        from app.services.slide_renderer import generate as generate_slides
        await generate_slides(
            prompt, base,
            num_slides=num_slides,
            on_progress=on_slide_rendered,
        )
    except Exception as e:
        err_path.write_text(f"generate_slides: {e}\n", encoding="utf-8")
        await sse.push(lecture_id, "job_error", message=f"슬라이드 자동 생성 오류: {e}")
        return

    await sse.push(
        lecture_id, "progress",
        label="슬라이드 디자인 완료",
        progress=hi_g,
    )

    # convert_to_images는 slides/ 캐시가 있으면 pptx_path를 사용하지 않고 short-circuit.
    # 더미 경로를 넘겨도 안전하다.
    dummy_pptx = base / "_synthetic.pptx"
    await _run_pipeline_phase1(dummy_pptx, base, lecture_id, cqi_text)


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


@router.post("/upload")
async def upload_pptx(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    cqi: str = Form(""),
    course: str = Form(""),
    week: str = Form(""),
):
    name = (file.filename or "").lower()
    ext = "." + name.rsplit(".", 1)[-1] if "." in name else ""
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"Only {sorted(ALLOWED_EXT)} are allowed")

    lecture_id = new_lecture_id()
    base = ensure_lecture_dirs(lecture_id)
    dest = base / f"source{ext}"

    max_bytes = settings.max_upload_mb * 1024 * 1024
    written = 0
    async with aiofiles.open(dest, "wb") as out:
        while chunk := await file.read(CHUNK):
            written += len(chunk)
            if written > max_bytes:
                await out.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(413, f"File exceeds {settings.max_upload_mb} MB")
            await out.write(chunk)

    # 포털 컨텍스트 + 원본 파일명 저장 (강의 제목 조합 + "최근 업로드 PPT" 목록에서 사용)
    meta = {
        "course": course,
        "week": week,
        "original_filename": file.filename or "",
        "source_type": "ppt",
    }
    (base / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False),
        encoding="utf-8",
    )

    # SSE 큐를 응답 전에 생성 — 클라이언트가 구독하기 전 이벤트 손실 방지
    sse.init(lecture_id)
    background.add_task(_run_pipeline_phase1, dest, base, lecture_id, cqi)

    return {
        "lecture_id": lecture_id,
        "filename": file.filename,
        "size_bytes": written,
    }


@router.post("/upload-prompt")
async def upload_from_prompt(
    background: BackgroundTasks,
    prompt: str = Form(...),
    num_slides: str = Form(""),
    cqi: str = Form(""),
    course: str = Form(""),
    week: str = Form(""),
):
    """교수자 프롬프트로 PPT를 자동 생성한 뒤 기존 파이프라인을 실행한다."""
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

    # 포털 컨텍스트 + source_type 저장 (강의 제목 조합 + "최근 프롬프트" 목록에서 사용)
    meta = {
        "course": course,
        "week": week,
        "source_type": "prompt",
        "num_slides_requested": num_slides_val,
    }
    (base / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False),
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
async def list_recent_uploads(type: str = "ppt", limit: int = 10):
    """최근 업로드 항목 목록 (강의 디렉터리 mtime 기준 최신순).

    - type=ppt: source.pptx가 있는 강의들 — 원본 파일명·course·week·created_at 반환
    - type=prompt: prompt.txt가 있는 강의들 — 프롬프트 전문·course·week·created_at 반환
    """
    if type not in ("ppt", "prompt"):
        raise HTTPException(400, "type must be 'ppt' or 'prompt'")

    root = settings.storage_root / "lectures"
    if not root.exists():
        return JSONResponse([])

    items = []
    for lpath in sorted(root.iterdir(), key=lambda p: p.stat().st_mtime if p.exists() else 0, reverse=True):
        if not lpath.is_dir():
            continue
        meta = _read_meta(lpath)

        if type == "ppt":
            # source.pptx 또는 source.ppt가 있어야 함
            src = None
            for ext in (".pptx", ".ppt"):
                p = lpath / f"source{ext}"
                if p.exists():
                    src = p
                    break
            if not src:
                continue
            # source_type이 명시되어 있으면 그것에 따르고, 없으면 source.pptx 존재로 판단 (legacy)
            if meta.get("source_type") and meta.get("source_type") != "ppt":
                continue
            items.append({
                "lecture_id": lpath.name,
                "original_filename": meta.get("original_filename") or src.name,
                "size_bytes": src.stat().st_size,
                "course": meta.get("course", ""),
                "week": meta.get("week", ""),
                "created_at": lpath.stat().st_mtime,
            })
        else:  # type == "prompt"
            prompt_path = lpath / "prompt.txt"
            if not prompt_path.exists():
                continue
            if meta.get("source_type") and meta.get("source_type") != "prompt":
                continue
            try:
                text = prompt_path.read_text(encoding="utf-8")
            except Exception:
                continue
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


@router.post("/upload-from-source")
async def upload_from_existing_source(
    background: BackgroundTasks,
    source_lecture_id: str = Form(...),
    cqi: str = Form(""),
    course: str = Form(""),
    week: str = Form(""),
):
    """기존 강의의 source.pptx를 복사해 새 강의 파이프라인을 시작한다.

    "최근 업로드 PPT" 목록에서 클릭 시 호출.
    """
    src_base = lecture_dir(source_lecture_id)
    if not src_base.exists():
        raise HTTPException(404, "source lecture not found")

    src_pptx = None
    for ext in (".pptx", ".ppt"):
        p = src_base / f"source{ext}"
        if p.exists():
            src_pptx = p
            break
    if not src_pptx:
        raise HTTPException(400, "원본 강의에 source.pptx가 없습니다.")

    src_meta = _read_meta(src_base)
    original_filename = src_meta.get("original_filename") or src_pptx.name

    lecture_id = new_lecture_id()
    base = ensure_lecture_dirs(lecture_id)
    dest = base / src_pptx.name
    shutil.copy2(src_pptx, dest)

    meta = {
        "course": course,
        "week": week,
        "original_filename": original_filename,
        "source_type": "ppt",
        "cloned_from": source_lecture_id,
    }
    (base / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False),
        encoding="utf-8",
    )

    sse.init(lecture_id)
    background.add_task(_run_pipeline_phase1, dest, base, lecture_id, cqi)

    return {
        "lecture_id": lecture_id,
        "filename": original_filename,
        "size_bytes": dest.stat().st_size,
        "cloned_from": source_lecture_id,
    }


@router.get("/lectures/{lecture_id}/status")
async def lecture_status(lecture_id: str):
    base = lecture_dir(lecture_id)
    if not base.exists():
        raise HTTPException(404, "lecture_id not found")
    slides = sorted((base / "slides").glob("slide_*.png"))
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
