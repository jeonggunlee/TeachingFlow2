import json
import re

from anthropic import AsyncAnthropic

from app.config import settings

_SYSTEM = """당신은 대학 강의 콘텐츠 개선 전문가입니다.
현재 강의 슬라이드 스크립트(JSON 배열)와 수강생 CQI 피드백을 받아 스크립트를 개선합니다.

반드시 아래 규칙을 따르세요:
- 입력과 동일한 JSON 배열 구조로 출력 (슬라이드 배열)
- 각 슬라이드의 slide_index, title은 유지
- highlight 좌표(x_pct, y_pct, w_pct, h_pct)와 effect는 절대 변경 금지
- CQI 피드백에 따라 segments의 script·keyword 텍스트를 개선
- 피드백에서 특정 내용 추가 요구 시 script를 확장하거나 세그먼트 추가
- 피드백에서 특정 내용 삭제·축소 요구 시 script를 축약하거나 세그먼트 삭제
- 새 segment는 id: "seg_N" (기존 최대 번호 다음), highlight는 전체 슬라이드 영역(x_pct:5, y_pct:5, w_pct:90, h_pct:90)
- 순수 JSON 배열만 출력, 코드블록·설명 일절 금지
""".strip()


async def apply(slides: list, cqi_text: str) -> list:
    """CQI 피드백을 반영하여 vision 슬라이드 스크립트를 개선한다."""
    client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    slides_json = json.dumps(slides, ensure_ascii=False, indent=2)
    user_msg = (
        f"현재 강의 슬라이드 스크립트 (JSON 배열):\n{slides_json}\n\n"
        f"CQI 피드백:\n{cqi_text}\n\n"
        "위 CQI 피드백을 반영하여 개선된 슬라이드 스크립트 JSON 배열을 출력하세요."
    )

    msg = await client.messages.create(
        model=settings.claude_model,
        max_tokens=8000,
        system=[{"type": "text", "text": _SYSTEM, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": user_msg}],
    )

    raw = msg.content[0].text.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\[.*\]", raw, re.DOTALL)
        if m:
            return json.loads(m.group())
        raise ValueError(f"CQI 응답에서 JSON 배열 추출 실패: {raw[:300]!r}")
