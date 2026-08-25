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
- 슬라이드 내용(아웃라인)이 함께 주어지면, **그 슬라이드에 실제로 있는 내용만** 설명할 것
- 누적 지시가 서로 충돌하면 **최신 지시를 따를 것**
- 순수 JSON 배열만 출력, 코드블록·설명 일절 금지
""".strip()


MAX_TOKENS  = 16000
CHUNK_SIZE  = 5      # 한 번에 개선할 슬라이드 수 — 응답 잘림 방지


def _parse(raw: str) -> list:
    raw = raw.strip()
    if "```" in raw:
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\[.*\]", raw, re.DOTALL)
        if m:
            return json.loads(m.group())
        raise ValueError(f"CQI 응답에서 JSON 배열 추출 실패: {raw[:300]!r}")


async def _apply_chunk(client, chunk: list, cqi_text: str, outline: list) -> list:
    """슬라이드 묶음 하나에 CQI를 반영한다."""
    idxs = {s.get("slide_index") for s in chunk}

    parts = []
    if outline:
        # 이 묶음에 해당하는 슬라이드 내용만 전달 (토큰 절약)
        rel = [o for i, o in enumerate(outline, 1) if i in idxs] or outline
        parts.append(
            "이 슬라이드들에 실제로 그려진 내용 (이 내용에 근거해 설명할 것):\n"
            + json.dumps(rel, ensure_ascii=False, indent=2) + "\n"
        )
    parts.append(
        "개선할 슬라이드 스크립트 (JSON 배열):\n"
        + json.dumps(chunk, ensure_ascii=False, indent=2) + "\n"
    )
    parts.append(f"CQI 피드백:\n{cqi_text}\n")
    parts.append(
        f"위 CQI 피드백을 반영해, 입력과 같은 {len(chunk)}개 슬라이드의 "
        "개선된 JSON 배열만 출력하세요."
    )

    msg = await client.messages.create(
        model=settings.claude_model,
        max_tokens=MAX_TOKENS,
        system=[{"type": "text", "text": _SYSTEM, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": "\n".join(parts)}],
    )

    if getattr(msg, "stop_reason", None) == "max_tokens":
        raise ValueError(
            f"응답이 max_tokens({MAX_TOKENS})에서 잘렸습니다 "
            f"— 슬라이드 {sorted(i for i in idxs if i is not None)}"
        )

    return _parse(msg.content[0].text)


async def apply(slides: list, cqi_text: str, outline: list = None) -> list:
    """CQI 피드백을 반영하여 vision 슬라이드 스크립트를 개선한다.

    outline이 주어지면 각 슬라이드에 실제로 그려진 내용을 컨텍스트로 함께 제공해,
    슬라이드에 없는 내용을 설명하는 오류를 막는다.

    슬라이드가 많으면 응답 JSON이 max_tokens에서 잘리므로 CHUNK_SIZE 단위로
    나눠 호출한다. 한 묶음이 실패해도 그 묶음만 원본을 유지하고 나머지는 반영한다.
    """
    client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    chunks = [slides[i:i + CHUNK_SIZE] for i in range(0, len(slides), CHUNK_SIZE)]
    out, failures = [], []

    for chunk in chunks:
        try:
            improved = await _apply_chunk(client, chunk, cqi_text, outline)
            # 응답 개수가 안 맞으면 slide_index로 맞춰 병합 (누락분은 원본 유지)
            by_idx = {s.get("slide_index"): s for s in improved
                      if isinstance(s, dict) and s.get("slide_index") is not None}
            out.extend(by_idx.get(src.get("slide_index"), src) for src in chunk)
        except Exception as e:
            failures.append(str(e))
            out.extend(chunk)   # 이 묶음은 원본 유지

    if failures and len(failures) == len(chunks):
        raise ValueError("CQI 반영 실패: " + "; ".join(failures[:3]))

    return out
