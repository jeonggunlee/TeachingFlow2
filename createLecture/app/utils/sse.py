"""SSE(Server-Sent Events) 이벤트 큐 관리.

파이프라인이 push()로 이벤트를 넣으면 stream()이 HTTP 클라이언트에게 스트리밍한다.
asyncio 단일 스레드 환경을 전제로 Queue로 구현한다.
"""
import asyncio
import json

_queues: dict[str, asyncio.Queue] = {}


def init(lecture_id: str) -> None:
    """업로드 핸들러가 응답 반환 직전에 호출 — SSE 구독 전 큐를 미리 생성."""
    _queues[lecture_id] = asyncio.Queue()


async def push(lid: str, event: str, **data) -> None:
    # 첫 번째 인수를 lid로 명명 — 호출 측에서 lecture_id=... 키워드 인수와 충돌 방지
    q = _queues.get(lid)
    if q:
        await q.put((event, data))


async def stream(lecture_id: str):
    """FastAPI StreamingResponse 에 넘길 async generator."""
    q = _queues.get(lecture_id)
    if q is None:
        payload = json.dumps({"message": "job not found"}, ensure_ascii=False)
        yield f"event: job_error\ndata: {payload}\n\n"
        return

    while True:
        try:
            event, data = await asyncio.wait_for(q.get(), timeout=25.0)
        except asyncio.TimeoutError:
            yield ": heartbeat\n\n"   # SSE keepalive comment
            continue

        payload = json.dumps(data, ensure_ascii=False)
        yield f"event: {event}\ndata: {payload}\n\n"

        if event in ("done", "job_error", "scripts_ready"):
            _queues.pop(lecture_id, None)
            return
