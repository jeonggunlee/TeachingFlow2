import json
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image


def _normalize_quiz(raw):
    """vision JSON의 quiz 필드를 검증·정규화. 유효하지 않으면 None.

    스키마: {type:"mcq", question:str, options:[str,...], correct_index:int, explanation?:str}
    """
    if not isinstance(raw, dict):
        return None
    qtype = raw.get("type", "mcq")
    if qtype != "mcq":
        return None
    question = (raw.get("question") or "").strip()
    options = raw.get("options") or []
    if not question or not isinstance(options, list) or len(options) < 2:
        return None
    # 빈 옵션이 섞이면 correct_index가 어긋날 위험 — 통째 거부.
    stripped = [str(o).strip() for o in options]
    if any(not o for o in stripped) or len(stripped) < 2:
        return None
    options = stripped
    try:
        correct_index = int(raw.get("correct_index", -1))
    except (TypeError, ValueError):
        return None
    if not (0 <= correct_index < len(options)):
        return None
    out = {
        "type": "mcq",
        "question": question,
        "options": options,
        "correct_index": correct_index,
    }
    explanation = (raw.get("explanation") or "").strip()
    if explanation:
        out["explanation"] = explanation
    return out


def _slide_size(slides_dir: Path) -> dict:
    first = next(iter(sorted(slides_dir.glob("slide_*.png"))), None)
    if not first:
        return {"w": 1280, "h": 720}
    w, h = Image.open(first).size
    return {"w": w, "h": h}


def _build_segment(seg: dict, audio_dir: Path) -> dict:
    seg_num = seg["id"].split("_")[-1].zfill(2)
    slide_idx = seg.get("_slide_index", 1)
    mp3_name = f"slide_{slide_idx:03d}_seg_{seg_num}.mp3"
    words_path = audio_dir / (mp3_name.replace(".mp3", ".words.json"))

    words = []
    if words_path.exists():
        words = json.loads(words_path.read_text(encoding="utf-8"))

    duration_ms = (
        words[-1]["offset_ms"] + words[-1]["duration_ms"] if words else 0.0
    )

    # highlight는 선택. 누락/None/빈 객체/0 크기는 모두 "강조 없음"으로 정규화한다.
    raw_hl = seg.get("highlight")
    hl = None
    if isinstance(raw_hl, dict):
        try:
            w = float(raw_hl.get("w_pct", 0) or 0)
            h = float(raw_hl.get("h_pct", 0) or 0)
            if w > 0 and h > 0:
                hl = raw_hl
        except (TypeError, ValueError):
            hl = None

    return {
        "id": seg["id"],
        "script": seg.get("script", ""),
        "keyword": seg.get("keyword", ""),
        "highlight": hl,
        "effect": seg.get("effect", "highlighter"),
        "audio": f"audio/{mp3_name}",
        "duration_ms": duration_ms,
        "words": words,
    }


def build(lecture_id: str, lecture_dir: Path) -> dict:
    """vision/ + audio/ + slides/ → lecture.json 반환 (파일 쓰기 포함)."""
    vision_dir = lecture_dir / "vision"
    audio_dir  = lecture_dir / "audio"
    slides_dir = lecture_dir / "slides"

    # 포털 컨텍스트 (교과목명·주차번호)
    meta_path = lecture_dir / "meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}

    slide_jsons = sorted(vision_dir.glob("slide_*.json"))
    title = ""
    slides_out = []

    for vpath in slide_jsons:
        vdata = json.loads(vpath.read_text(encoding="utf-8"))
        idx = vdata.get("slide_index", int(vpath.stem.split("_")[-1]))
        if not title and vdata.get("title"):
            title = vdata["title"]

        segments = []
        for seg in vdata.get("segments", []):
            seg["_slide_index"] = idx
            segments.append(_build_segment(seg, audio_dir))

        slide_out = {
            "index": idx,
            "image": f"slides/slide_{idx:03d}.png",
            "segments": segments,
        }

        # 체크포인트 퀴즈(선택) — vision JSON에 있으면 lecture.json으로 보존
        quiz = _normalize_quiz(vdata.get("quiz"))
        if quiz:
            slide_out["quiz"] = quiz

        slides_out.append(slide_out)

    slides_out.sort(key=lambda s: s["index"])

    # 제목 조합: 포털 컨텍스트가 있으면 "교과목명-주차번호-강의제목" 형식
    base_title = title or lecture_id
    course = meta.get("course", "").strip()
    week   = meta.get("week", "").strip()
    if course and week:
        final_title = f"{course}-{week}주차-{base_title}"
    else:
        final_title = base_title

    lecture = {
        "lecture_id": lecture_id,
        "title": final_title,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "slide_size": _slide_size(slides_dir),
        "slide_count": len(slides_out),
        "segment_count": sum(len(s["segments"]) for s in slides_out),
        "slides": slides_out,
    }

    out_path = lecture_dir / "lecture.json"
    out_path.write_text(json.dumps(lecture, ensure_ascii=False, indent=2), encoding="utf-8")
    return lecture
