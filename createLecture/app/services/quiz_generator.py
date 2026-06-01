"""슬라이드 스크립트로부터 4지선다 체크포인트 퀴즈 1개를 Claude로 초안 생성."""
import json
import re
from typing import Optional

from anthropic import AsyncAnthropic

from app.config import settings


_SYSTEM = """당신은 대학 강의 평가 문항을 작성하는 교육공학 전문가입니다.
주어진 슬라이드의 스크립트와 키워드를 바탕으로, 학생이 그 슬라이드 내용을 이해했는지 확인할 4지선다 퀴즈를 1개 작성합니다.

반드시 아래 규칙을 따르세요:
- 출력은 **JSON 객체 하나만** — 코드블록·설명·앞뒤 텍스트 일체 금지
- 스키마: {"type":"mcq", "question": "...", "options": ["...","...","...","..."], "correct_index": 0~3, "explanation": "..."}
- options 는 정확히 4개, 길이가 비슷하도록 작성
- correct_index 는 0~3 사이 정수 (정답이 위치한 인덱스)
- 한국어로 작성
- question은 슬라이드의 핵심 개념을 직접 묻는 1문장
- 오답(distractor)은 그럴듯하되 명백히 틀린 내용
- explanation은 1~2문장으로 정답을 간단히 설명
""".strip()


async def generate(slide_title: str, scripts: list[str], keywords: list[str]) -> Optional[dict]:
    """슬라이드 컨텍스트로 퀴즈 1개 초안 생성. 실패 시 None.

    Args:
        slide_title: 슬라이드 제목 (없으면 빈 문자열)
        scripts: 세그먼트별 스크립트 텍스트
        keywords: 세그먼트별 키워드 (정답 단서로 활용)
    """
    if not settings.anthropic_api_key:
        return None

    parts = []
    if slide_title:
        parts.append(f"슬라이드 제목: {slide_title}")
    if keywords:
        cleaned = [k for k in keywords if k]
        if cleaned:
            parts.append(f"핵심 키워드: {', '.join(cleaned)}")
    if scripts:
        joined = "\n".join(f"- {s.strip()}" for s in scripts if s and s.strip())
        if joined:
            parts.append("스크립트:\n" + joined)
    if not parts:
        return None
    user_msg = "\n\n".join(parts) + "\n\n위 슬라이드 내용을 평가할 4지선다 퀴즈 1개를 JSON으로 작성하세요."

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    msg = await client.messages.create(
        model=settings.claude_model,
        max_tokens=800,
        system=[{"type": "text", "text": _SYSTEM, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": user_msg}],
    )

    raw = msg.content[0].text.strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if not m:
            return None
        try:
            data = json.loads(m.group())
        except json.JSONDecodeError:
            return None

    # 기본 정합성 검사 — lecture_builder._normalize_quiz가 최종 검증
    if not isinstance(data, dict):
        return None
    if data.get("type") != "mcq":
        data["type"] = "mcq"
    opts = data.get("options")
    if not isinstance(opts, list) or len(opts) != 4:
        return None
    try:
        ci = int(data.get("correct_index", -1))
    except (TypeError, ValueError):
        return None
    if not (0 <= ci < 4):
        return None

    return {
        "type": "mcq",
        "question": str(data.get("question", "")).strip(),
        "options": [str(o).strip() for o in opts],
        "correct_index": ci,
        "explanation": str(data.get("explanation", "")).strip(),
    }
