import json
import shutil

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from app.config import settings
from app.utils.storage import lecture_dir

router = APIRouter(prefix="/api", tags=["lectures"])


@router.get("/lectures")
async def list_lectures(course: str = "", week: str = ""):
    """완료된 강의 목록 반환 (lecture.json이 있는 것만, 최신순). course/week 필터 지원."""
    root = settings.storage_root / "lectures"
    result = []
    if root.exists():
        for lpath in sorted(root.iterdir(), reverse=True):
            if not lpath.is_dir():
                continue
            lj = lpath / "lecture.json"
            if not lj.exists():
                continue

            # meta.json 읽기
            meta: dict = {}
            meta_path = lpath / "meta.json"
            if meta_path.exists():
                try:
                    meta = json.loads(meta_path.read_text(encoding="utf-8"))
                except Exception:
                    pass

            # course/week 필터
            if course and meta.get("course", "") != course:
                continue
            if week and str(meta.get("week", "")) != str(week):
                continue

            try:
                data = json.loads(lj.read_text(encoding="utf-8"))
                slides = data.get("slides", [])
                result.append({
                    "lecture_id": lpath.name,
                    "title": data.get("title", lpath.name),
                    "created_at": data.get("created_at", ""),
                    "slide_count": len(slides),
                    "segment_count": sum(len(s.get("segments", [])) for s in slides),
                    "has_cqi": (lpath / "cqi.txt").exists(),
                    "course": meta.get("course", ""),
                    "week": meta.get("week", ""),
                })
            except Exception:
                continue
    return JSONResponse(result)


@router.get("/lectures/{lecture_id}")
async def get_lecture(lecture_id: str):
    base = lecture_dir(lecture_id)
    lj = base / "lecture.json"
    if not lj.exists():
        raise HTTPException(404, "lecture.json not ready yet")
    data = json.loads(lj.read_text(encoding="utf-8"))
    # 포털 컨텍스트(course, week)를 응답에 병합 — 플레이어 뒤로가기 버튼에서 사용
    meta_path = base / "meta.json"
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            data.setdefault("course", meta.get("course", ""))
            data.setdefault("week",   meta.get("week", ""))
        except Exception:
            pass
    return JSONResponse(data)


@router.delete("/lectures/{lecture_id}")
async def delete_lecture(lecture_id: str):
    """강의 디렉터리 전체를 디스크에서 삭제."""
    base = lecture_dir(lecture_id)
    if not base.exists():
        raise HTTPException(404, "강의를 찾을 수 없습니다.")
    shutil.rmtree(base)
    return JSONResponse({"deleted": lecture_id})


