import asyncio
import base64
import json
import re
import time
from pathlib import Path

from anthropic import AsyncAnthropic

from app.config import settings

_SYSTEM_PROMPT = """
당신은 강의 슬라이드를 분석하는 전문가입니다.
슬라이드 이미지를 보고 **반드시 아래 JSON 형식만** 출력하세요.
코드블록, 설명, 마크다운 없이 순수 JSON 객체 하나만 출력합니다.

출력 형식:
{
  "slide_index": <int>,
  "title": "<슬라이드 제목>",
  "segments": [
    {
      "id": "seg_1",
      "script": "<이 영역을 설명하는 강의 스크립트 (2~4문장, 한국어)>",
      "keyword": "<강조할 핵심 키워드 1개>",
      "highlight": {
        "x_pct": <float 0-100>,
        "y_pct": <float 0-100>,
        "w_pct": <float 0-100>,
        "h_pct": <float 0-100>
      },
      "effect": "highlighter"
    }
  ]
}

규칙:
- segments는 슬라이드의 주요 내용 영역마다 1개씩 (보통 2~5개)
- highlight 좌표는 슬라이드 전체 크기 대비 백분율 (x_pct + w_pct <= 100, y_pct + h_pct <= 100)
- script는 자연스러운 강의 말투로 작성 (예: "이 슬라이드에서는 ... 을 살펴봅니다.")
- effect는 항상 "highlighter"
- 출력은 JSON 객체 하나뿐, 다른 텍스트 일절 금지
""".strip()


def _b64(path: Path) -> str:
    return base64.standard_b64encode(path.read_bytes()).decode()


def _extract_json(text: str) -> dict:
    text = text.strip()
    # 순수 JSON이면 바로 파싱
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # 코드블록이나 앞뒤 텍스트가 붙은 경우 정규식으로 추출
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if m:
        return json.loads(m.group())
    raise ValueError(f"JSON 추출 실패: {text[:200]!r}")


async def _call_claude(client: AsyncAnthropic, image_path: Path, slide_index: int) -> dict:
    msg = await client.messages.create(
        model=settings.claude_model,
        max_tokens=2000,
        system=[
            {
                "type": "text",
                "text": _SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": _b64(image_path),
                        },
                    },
                    {
                        "type": "text",
                        "text": f"슬라이드 번호: {slide_index}. 위 슬라이드를 분석하여 JSON을 출력하세요.",
                    },
                ],
            }
        ],
    )
    return msg.content[0].text, msg.usage


async def _analyze_one(
    client: AsyncAnthropic,
    image_path: Path,
    slide_index: int,
    out_path: Path,
) -> dict:
    """슬라이드 1장 분석. 캐시 파일이 있으면 재사용."""
    if out_path.exists():
        return json.loads(out_path.read_text(encoding="utf-8"))

    raw_text, usage = await _call_claude(client, image_path, slide_index)

    # 1회 재시도
    try:
        result = _extract_json(raw_text)
    except (ValueError, json.JSONDecodeError):
        raw_text2, usage = await _call_claude(client, image_path, slide_index)
        try:
            result = _extract_json(raw_text2)
        except (ValueError, json.JSONDecodeError):
            result = {"slide_index": slide_index, "title": "", "segments": []}

    result["slide_index"] = slide_index
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


async def analyze_all(
    slides: list[Path],
    lecture_dir: Path,
    *,
    concurrency: int = 4,
    force: bool = False,
    on_progress=None,   # async callable(slide_idx: int) | None
) -> list[dict]:
    """슬라이드 PNG 목록 → 분석 결과 목록. 캐시 재사용, 동시성 제어."""
    vision_dir = lecture_dir / "vision"
    vision_dir.mkdir(exist_ok=True)

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    sem = asyncio.Semaphore(concurrency)

    async def _guarded(image_path: Path, idx: int) -> dict:
        out = vision_dir / f"slide_{idx:03d}.json"
        if not force and out.exists():
            result = json.loads(out.read_text(encoding="utf-8"))
        else:
            async with sem:
                t0 = time.perf_counter()
                result = await _analyze_one(client, image_path, idx, out)
                elapsed = time.perf_counter() - t0
                print(f"  slide {idx:03d}: {len(result.get('segments', []))} segments ({elapsed:.1f}s)")
        if on_progress:
            await on_progress(idx)
        return result

    tasks = [_guarded(p, i) for i, p in enumerate(slides, start=1)]
    return await asyncio.gather(*tasks)
