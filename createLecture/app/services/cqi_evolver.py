"""CQI 누적 지시를 반영해 **슬라이드 아웃라인 자체를 진화**시킨다.

입력:
  - 현재 버전의 페이지별 내용 (outline.json — 슬라이드에 무엇이 있는지)
  - 현재 버전의 페이지별 내레이션 (vision/*.json — 어떻게 설명하는지)
  - 디자인 고정 스펙 (design.json — 시각 디자인은 절대 바꾸지 않음)
  - 누적 CQI 지시 (cqi_ledger.json 중 승인된 항목, 최신 우선)

출력: 진화된 아웃라인 배열 (slide_renderer.render_outline 으로 렌더)
"""
import json
import re
from typing import Optional

from anthropic import AsyncAnthropic

from app.config import settings
from app.services.design_spec import LAYOUTS, rules_prompt

MAX_TOKENS = 16000

_SYSTEM = """당신은 대학 강의 슬라이드를 개선하는 교육 콘텐츠 설계자입니다.
현재 강의의 페이지별 슬라이드 내용과, 실제 수강생 데이터에서 도출된 누적 CQI 개선 지시를 받아
**슬라이드 구성을 개선한 새 버전**을 만듭니다.

반드시 지킬 것:
- 출력은 순수 JSON 배열만 (코드블록·설명 일절 금지)
- 배열의 각 원소는 슬라이드 1장의 아웃라인 스펙
- 시각 디자인(색·폰트·여백)은 시스템이 고정하므로 스타일 필드를 넣지 말 것
- 허용 레이아웃과 다이어그램 작도 규칙은 사용자 메시지의 고정 규칙을 그대로 따를 것
- 관계를 설명하는 슬라이드는 글머리표 대신 다이어그램 레이아웃을 쓸 것

개선 방침:
- 혼란도가 높았던 개념은 설명을 쪼개거나 예시 슬라이드를 **추가**할 것
- 지시가 '슬라이드 추가'를 요구하면 실제로 슬라이드를 늘릴 것
- 지시가 '예시 추가'를 요구하면 구체적 예시가 담긴 내용으로 보강할 것
- 잘 이해된 부분은 불필요하게 바꾸지 말 것 (안정성 유지)
- 강의의 전체 흐름과 학습 목표는 유지할 것
- 누적 지시가 서로 충돌하면 **최신 지시를 따를 것**

각 슬라이드에 이번 개선에서 무엇을 했는지 `_change` 필드를 짧게 덧붙이세요
("추가"/"보강"/"유지"/"분할" 중 하나 + 한 줄 사유). 이 필드는 렌더에 사용되지 않습니다.
""".strip()


def _parse_array(raw: str) -> list:
    raw = raw.strip()
    if "```" in raw:
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\[.*\]", raw, re.DOTALL)
        if not m:
            raise ValueError(f"진화 응답에서 JSON 배열 추출 실패: {raw[:300]!r}")
        data = json.loads(m.group())
    if not isinstance(data, list):
        raise ValueError("진화 응답이 배열이 아닙니다.")
    return data


def _narration_digest(vision: list) -> str:
    """현재 내레이션을 슬라이드별로 요약해 컨텍스트로 제공."""
    lines = []
    for s in vision or []:
        idx = s.get("slide_index", 0)
        title = s.get("title", "")
        lines.append(f"[슬라이드 {idx}] {title}")
        for seg in s.get("segments", []):
            script = (seg.get("script") or "").strip().replace("\n", " ")
            if script:
                lines.append(f"  · {script[:160]}")
    return "\n".join(lines)


def _sanitize(outline: list) -> list:
    """레이아웃 값 검증 — 미지원 레이아웃은 bullets로 보정."""
    out = []
    for s in outline:
        if not isinstance(s, dict):
            continue
        if s.get("layout") not in LAYOUTS:
            s["layout"] = "bullets"
        out.append(s)
    return out


async def evolve_outline(
    outline: list,
    instructions: str,
    *,
    design: dict,
    vision: Optional[list] = None,
    lecture_title: str = "",
) -> list:
    """현재 아웃라인 + 누적 지시 → 진화된 아웃라인."""
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY 가 설정되지 않았습니다 (.env 확인)")
    if not instructions.strip():
        raise ValueError("반영할 승인된 CQI 지시가 없습니다.")

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    parts = [rules_prompt(design), ""]
    if lecture_title:
        parts += [f"강의 제목: {lecture_title}", ""]
    parts += [
        "── 현재 버전의 페이지별 슬라이드 내용 (JSON) ──",
        json.dumps(outline, ensure_ascii=False, indent=2),
        "",
    ]
    if vision:
        parts += [
            "── 현재 버전의 페이지별 강의 내레이션 (참고) ──",
            _narration_digest(vision),
            "",
        ]
    parts += [
        instructions,
        "",
        "위 누적 지시를 반영해 개선된 슬라이드 아웃라인 JSON 배열만 출력하세요.",
    ]

    msg = await client.messages.create(
        model=settings.claude_model,
        max_tokens=MAX_TOKENS,
        system=[{"type": "text", "text": _SYSTEM,
                 "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": "\n".join(parts)}],
    )
    if getattr(msg, "stop_reason", None) == "max_tokens":
        raise ValueError(
            f"진화 응답이 max_tokens({MAX_TOKENS})에서 잘렸습니다. "
            "지시문을 줄이거나 슬라이드 수를 조정해 다시 시도하세요."
        )
    return _sanitize(_parse_array(msg.content[0].text))
