import json

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import JSONResponse

import app.utils.sse as sse
from app.utils.storage import lecture_dir

router = APIRouter(prefix="/api", tags=["scripts"])


@router.get("/lectures/{lecture_id}/scripts")
async def get_scripts(lecture_id: str):
    base = lecture_dir(lecture_id)
    vision_dir = base / "vision"
    if not vision_dir.exists():
        raise HTTPException(404, "vision data not ready")

    slides = []
    for vpath in sorted(vision_dir.glob("slide_*.json")):
        data = json.loads(vpath.read_text(encoding="utf-8"))
        idx = data.get("slide_index", int(vpath.stem.split("_")[-1]))
        slide_entry = {
            "index": idx,
            "title": data.get("title", ""),
            "segments": data.get("segments", []),
            "quiz": data.get("quiz"),     # 체크포인트 퀴즈(선택) — 편집기로 전달
        }
        # HTML 슬라이드 우선, 없으면 레거시 PNG
        if (base / "slides" / f"slide_{idx:03d}.html").exists():
            slide_entry["html"] = f"slides/slide_{idx:03d}.html"
        if (base / "slides" / f"slide_{idx:03d}.png").exists():
            slide_entry["image"] = f"slides/slide_{idx:03d}.png"
        slides.append(slide_entry)

    slides.sort(key=lambda s: s["index"])

    cqi_path = base / "cqi.txt"
    cqi_text = cqi_path.read_text(encoding="utf-8") if cqi_path.exists() else ""

    meta_path = base / "meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}

    return JSONResponse({
        "lecture_id": lecture_id,
        "slide_css": ("slides/slide.css"
                      if (base / "slides" / "slide.css").exists() else None),
        "cqi": cqi_text,
        "has_lecture_json": (base / "lecture.json").exists(),
        "course": meta.get("course", ""),
        "week":   meta.get("week", ""),
        "slides": slides,
    })


@router.put("/lectures/{lecture_id}/scripts")
async def put_scripts(lecture_id: str, request: Request):
    payload = await request.json()
    base = lecture_dir(lecture_id)
    vision_dir = base / "vision"
    if not vision_dir.exists():
        raise HTTPException(404, "vision data not ready")

    slides = payload.get("slides", [])
    for slide in slides:
        idx = slide["index"]
        out_path = vision_dir / f"slide_{idx:03d}.json"
        data = {
            "slide_index": idx,
            "title": slide.get("title", ""),
            "segments": slide.get("segments", []),
        }
        # 체크포인트 퀴즈(선택) — 빈/유효하지 않은 quiz는 저장에서 생략
        quiz = slide.get("quiz")
        if isinstance(quiz, dict) and quiz.get("question"):
            data["quiz"] = quiz
        out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    return {"ok": True, "saved": len(slides)}


@router.post("/lectures/{lecture_id}/synthesize")
async def start_synthesize(lecture_id: str, background: BackgroundTasks):
    base = lecture_dir(lecture_id)
    if not base.exists():
        raise HTTPException(404, "lecture not found")

    from app.api.upload import _run_pipeline_phase2
    sse.init(lecture_id)
    background.add_task(_run_pipeline_phase2, base, lecture_id)
    return {"lecture_id": lecture_id}


@router.post("/lectures/{lecture_id}/slides/{slide_idx}/quiz/generate")
async def generate_quiz_draft(lecture_id: str, slide_idx: int):
    """슬라이드 컨텍스트로 4지선다 퀴즈 초안 생성. 저장은 하지 않음.

    slide_idx 는 vision JSON의 1-based 'slide_index'.
    """
    base = lecture_dir(lecture_id)
    vision_dir = base / "vision"
    if not vision_dir.exists():
        raise HTTPException(404, "vision data not ready")

    vpath = vision_dir / f"slide_{slide_idx:03d}.json"
    if not vpath.exists():
        raise HTTPException(404, "슬라이드를 찾을 수 없습니다.")
    vdata = json.loads(vpath.read_text(encoding="utf-8"))
    segments = vdata.get("segments") or []
    scripts  = [s.get("script", "") for s in segments]
    keywords = [s.get("keyword", "") for s in segments]
    title    = vdata.get("title", "")

    from app.services.quiz_generator import generate as gen_quiz
    try:
        quiz = await gen_quiz(title, scripts, keywords)
    except Exception as e:
        raise HTTPException(502, f"퀴즈 생성 실패: {e}")
    if not quiz:
        raise HTTPException(422, "유효한 퀴즈를 생성하지 못했습니다.")
    return JSONResponse(quiz)


@router.post("/lectures/{lecture_id}/rebuild-json")
async def rebuild_json(lecture_id: str):
    """TTS 재합성 없이 lecture.json만 재빌드 (형광펜 위치 변경 등에 사용)."""
    base = lecture_dir(lecture_id)
    if not base.exists():
        raise HTTPException(404, "lecture not found")
    if not (base / "audio").exists():
        raise HTTPException(400, "음성 파일이 없습니다. 먼저 TTS를 생성하세요.")

    from app.services.lecture_builder import build as build_lecture
    from app.utils.storage import lecture_id_from_path
    try:
        build_lecture(lecture_id_from_path(base), base)
    except Exception as e:
        raise HTTPException(500, f"빌드 오류: {e}")
    return {"ok": True, "lecture_id": lecture_id}
