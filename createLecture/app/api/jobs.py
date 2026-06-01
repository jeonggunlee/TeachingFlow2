from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.utils.sse import stream

router = APIRouter(prefix="/api", tags=["jobs"])


@router.get("/jobs/{lecture_id}/events")
async def job_events(lecture_id: str):
    return StreamingResponse(
        stream(lecture_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",   # nginx 버퍼링 비활성화
        },
    )
