"""AI 교수 답변 · 자동 질문 생성 서비스.

강의별 운영 설정(LectureSettings)에 따라 채팅창에서 동작한다.
 · ai_answer     : 학생 질문이 올라오면 교수 입장의 답변을 자동 작성
 · auto_question : 학생 관심을 끌 만한 질문을 학생인 척 만들고, 교수 답변까지 생성

ANTHROPIC_API_KEY 가 비어 있으면 모든 함수가 조용히 비활성화된다(None 반환).
"""
import json
from typing import Optional

from ..config import (
    ANTHROPIC_API_KEY,
    CLAUDE_MODEL,
    CREATELECTURE_STORAGE_ROOT,
    STORAGE_ROOT,
)

_client = None


def is_enabled() -> bool:
    return bool(ANTHROPIC_API_KEY)


def _get_client():
    global _client
    if _client is None:
        from anthropic import AsyncAnthropic
        _client = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
    return _client


def _slide_context(lecture_id: str, slide_idx: int) -> dict:
    """lecture.json 에서 해당 슬라이드의 스크립트·키워드를 추출한다."""
    for root in (STORAGE_ROOT, CREATELECTURE_STORAGE_ROOT):
        lj = root / "lectures" / lecture_id / "lecture.json"
        if lj.exists():
            try:
                data = json.loads(lj.read_text(encoding="utf-8"))
            except Exception:
                continue
            title = data.get("title", lecture_id)
            for s in data.get("slides", []):
                # lecture.json 의 index 는 1-base, slide_idx 는 0-base
                if int(s.get("index", 0)) - 1 == slide_idx:
                    segs = s.get("segments", [])
                    script = " ".join(
                        (seg.get("script") or "").strip() for seg in segs
                    ).strip()
                    keywords = [
                        seg.get("keyword") for seg in segs if seg.get("keyword")
                    ]
                    return {"title": title, "script": script, "keywords": keywords}
            return {"title": title, "script": "", "keywords": []}
    return {"title": lecture_id, "script": "", "keywords": []}


def _extract_json(raw: str) -> Optional[dict]:
    raw = raw.strip()
    if "```" in raw:
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()
    try:
        return json.loads(raw)
    except Exception:
        return None


async def generate_answer(lecture_id: str, slide_idx: int, question: str) -> Optional[str]:
    """학생 질문에 대한 교수 답변 텍스트를 생성한다."""
    if not is_enabled():
        return None

    ctx = _slide_context(lecture_id, slide_idx)
    prompt = f"""당신은 대학 강의를 진행하는 교수입니다. 지금 강의 중 채팅창에 올라온 학생 질문에 답합니다.

[강의 제목] {ctx['title']}
[현재 슬라이드 설명]
{ctx['script'] or '(설명 없음)'}

[핵심 키워드] {', '.join(ctx['keywords']) or '(없음)'}

[학생 질문]
{question}

지침:
- 교수답게 친근하지만 정확하게, 한국어 존댓말로 답하세요.
- 현재 슬라이드 내용에 근거해 핵심을 짚어 설명하세요.
- 3~6문장으로 간결하게. 불필요한 서론 없이 바로 답하세요.
- 마크다운 기호(**, # 등) 없이 자연스러운 문장으로만 작성하세요.

답변 본문만 출력하세요."""

    try:
        msg = await _get_client().messages.create(
            model=CLAUDE_MODEL,
            max_tokens=800,
            messages=[{"role": "user", "content": prompt}],
        )
        text = msg.content[0].text.strip()
        return text or None
    except Exception:
        return None


async def generate_question(
    lecture_id: str,
    slide_idx: int,
    real_questions: Optional[list[str]] = None,
    avoid: Optional[list[str]] = None,
) -> Optional[dict]:
    """학생인 척하는 관심 유도 질문 + 교수 답변을 함께 생성한다.

    real_questions 가 주어지면 실제 수강생이 남긴 질문을 근거로 가장 대표적인 궁금증을
    학생풍으로 자연스럽게 재구성한다(없으면 슬라이드 스크립트만으로 생성).

    반환: {"student_name": str, "question": str, "answer": str, "based_on_real": bool}
    """
    if not is_enabled():
        return None

    ctx = _slide_context(lecture_id, slide_idx)
    real_questions = [q.strip() for q in (real_questions or []) if q and q.strip()]

    if real_questions:
        joined = "\n".join(f"- {q}" for q in real_questions[:15])
        source_block = f"""[이 슬라이드에서 실제 수강생들이 남긴 질문]
{joined}

지침:
- 위 실제 질문들에서 가장 자주 나오거나 핵심적인 궁금증 하나를 골라, 학생이 새로 물어보는 것처럼 자연스럽게 다듬어 주세요.
- 여러 질문이 비슷하면 하나로 합쳐도 됩니다. 실제 학생들의 관심사를 반영하는 것이 목적입니다."""
    else:
        source_block = """지침:
- 이 슬라이드 핵심 개념과 직접 관련되고, 다른 학생도 궁금해할 만한 질문을 하나 만들어 주세요."""

    avoid = [a.strip() for a in (avoid or []) if a and a.strip()]
    avoid_block = ""
    if avoid:
        joined_avoid = "\n".join(f"- {a}" for a in avoid[:10])
        avoid_block = f"""

[이미 만들어진 질문 — 이것과 겹치지 않는 새로운 질문으로]
{joined_avoid}"""

    prompt = f"""당신은 대학 강의를 돕는 조교입니다. 아래 슬라이드에 대해, 학생들의 관심과 이해를 끌어올릴 만한
'학생이 던진 것처럼 자연스러운 질문' 하나와, 그에 대한 교수의 답변을 만들어 주세요.

[강의 제목] {ctx['title']}
[현재 슬라이드 설명]
{ctx['script'] or '(설명 없음)'}

[핵심 키워드] {', '.join(ctx['keywords']) or '(없음)'}

{source_block}{avoid_block}

공통 지침:
- 질문은 실제 수강생이 쓴 것처럼 자연스러운 한국어 존댓말로. 예: "교수님, A 부분이 잘 이해가 안 되는데 추가 설명 부탁드립니다."
- student_name 은 한국식 실명처럼 자연스러운 이름(성+이름).
- answer 는 교수 입장에서 한국어 존댓말로 3~6문장, 마크다운 없이.
- 반드시 아래 JSON 형식으로만 출력(코드블록 없이):

{{"student_name": "홍길동", "question": "교수님, ...", "answer": "..."}}"""

    try:
        msg = await _get_client().messages.create(
            model=CLAUDE_MODEL,
            max_tokens=900,
            messages=[{"role": "user", "content": prompt}],
        )
        parsed = _extract_json(msg.content[0].text)
        if not parsed:
            return None
        name = (parsed.get("student_name") or "익명 학생").strip()
        question = (parsed.get("question") or "").strip()
        answer = (parsed.get("answer") or "").strip()
        if not question or not answer:
            return None
        return {
            "student_name": name,
            "question": question,
            "answer": answer,
            "based_on_real": bool(real_questions),
        }
    except Exception:
        return None
