"""아웃라인 → 슬라이드별 강의 내레이션(segments) 생성.

기존 `vision_analyzer`는 슬라이드 PNG를 보고 강조 좌표(x_pct 등)를 **추측**했다.
이 모듈은 슬라이드를 우리가 직접 만들었다는 점을 활용해, 각 세그먼트가
어떤 텍스트 요소를 설명하는지 **요소 id(`ref`)로 지정**한다.
좌표 추측이 사라지므로 강조가 문장에서 벗어나지 않는다.

`ref`는 slide_renderer가 각 요소에 부여한 `data-ref` 값과 1:1로 대응한다.
  title   : t, st
  section : no, t
  venn    : t, v1, v2, v3        flow   : t, f1, f2, ...
  layers  : t, y1, y2, ...       cycle  : t, c1, c2, ...
  figure  : t, fig
  bullets : t, b1, b2, ...
  two_col : t, lh, l1.., rh, r1..
  quote   : q, attr
  stat    : val, lbl, cap
  closing : t, st
"""
import asyncio
import json
import re
from pathlib import Path
from typing import Optional

from anthropic import AsyncAnthropic

from app.config import settings

_SYSTEM = """당신은 대학 강의 스크립트 작가입니다.
슬라이드 한 장의 구조(JSON)를 받아, 그 슬라이드를 설명하는 강의 내레이션을 만듭니다.

출력 스키마 (JSON 객체 하나만):
{
  "title": "슬라이드 제목",
  "segments": [
    { "ref": "b1", "keyword": "핵심 키워드", "script": "강의 내레이션 2~4문장" }
  ]
}

규칙:
- segments는 슬라이드의 주요 요소마다 1개씩 (보통 2~5개)
- 다이어그램 슬라이드는 그림의 각 부분(도형)을 순서대로 짚어가며 설명할 것
- **ref는 반드시 입력에 주어진 요소 id 중 하나**를 그대로 사용할 것 (새로 만들지 말 것)
- 요소가 나타나는 순서대로 segments를 배열할 것
- keyword는 그 요소에서 강조할 핵심어 (해당 요소 텍스트 안에 실제로 있는 표현)
- script는 자연스러운 강의 말투 (예: "이 부분에서는 ... 을 살펴봅니다.")
- 앞뒤 슬라이드 흐름을 고려해 자연스럽게 이어지도록 작성할 것
- 출력은 JSON 객체 하나뿐, 코드블록·설명 일절 금지
""".strip()


def _refs_of(slide: dict) -> list:
    """아웃라인 슬라이드에서 강조 가능한 요소 id 목록과 텍스트를 뽑는다.

    slide_renderer의 data-ref 부여 규칙과 반드시 일치해야 한다.
    """
    layout = slide.get("layout", "bullets")
    out = []

    def add(ref, text):
        text = (str(text) if text is not None else "").strip()
        if text:
            out.append({"ref": ref, "text": text})

    if layout == "title":
        add("t", slide.get("title")); add("st", slide.get("subtitle"))
    elif layout == "section":
        add("no", slide.get("section_no") or slide.get("no"))
        add("t", slide.get("title"))
    elif layout == "two_col":
        add("t", slide.get("title"))
        for side, key in (("l", "left"), ("r", "right")):
            col = slide.get(key) or {}
            add(f"{side}h", col.get("heading"))
            for i, p in enumerate(col.get("points") or [], 1):
                add(f"{side}{i}", p)
    elif layout == "quote":
        add("q", slide.get("quote")); add("attr", slide.get("attribution"))
    elif layout == "stat":
        add("val", slide.get("value")); add("lbl", slide.get("label"))
        add("cap", slide.get("caption"))
    elif layout == "closing":
        add("t", slide.get("title")); add("st", slide.get("subtitle"))
    elif layout in ("venn", "flow", "layers", "cycle"):
        # 다이어그램 — 제목 + 각 도형을 개별 강조할 수 있다
        add("t", slide.get("title"))
        key, prefix = {
            "venn":   ("sets",   "v"),
            "flow":   ("steps",  "f"),
            "layers": ("layers", "y"),
            "cycle":  ("steps",  "c"),
        }[layout]
        for i, it in enumerate(slide.get(key) or [], 1):
            name = it.get("name") if isinstance(it, dict) else it
            note = it.get("note") if isinstance(it, dict) else ""
            add(f"{prefix}{i}", f"{name}{(' — ' + note) if note else ''}")
    elif layout == "figure":
        add("t", slide.get("title"))
        add("fig", slide.get("caption") or "개념도")
    else:  # bullets
        add("t", slide.get("title"))
        bullets = slide.get("bullets") or ([slide["content"]] if slide.get("content") else [])
        for i, b in enumerate(bullets, 1):
            add(f"b{i}", b)
    return out


def _parse(raw: str) -> dict:
    raw = raw.strip()
    if "```" in raw:
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if m:
            return json.loads(m.group())
        raise


def _fallback(slide: dict, refs: list, idx: int) -> dict:
    """Claude 호출 실패 시 슬라이드 텍스트를 그대로 읽는 최소 내레이션."""
    return {
        "slide_index": idx,
        "title": slide.get("title", "") or f"슬라이드 {idx}",
        "segments": [
            {
                "id": f"seg_{i}",
                "ref": r["ref"],
                "keyword": r["text"][:20],
                "script": r["text"],
                "effect": "highlighter",
            }
            for i, r in enumerate(refs, 1)
        ],
    }


async def _one(client, slide: dict, idx: int, total: int,
               deck_digest: str, sem: asyncio.Semaphore) -> dict:
    refs = _refs_of(slide)
    if not refs:
        return {"slide_index": idx, "title": slide.get("title", ""), "segments": []}

    payload = {
        "layout": slide.get("layout", "bullets"),
        "elements": refs,
    }
    user = (
        f"강의 전체 흐름 (참고):\n{deck_digest}\n\n"
        f"지금 작성할 슬라이드: {idx}/{total}\n"
        f"{json.dumps(payload, ensure_ascii=False, indent=2)}\n\n"
        "이 슬라이드의 내레이션 JSON을 출력하세요."
    )

    async with sem:
        try:
            msg = await client.messages.create(
                model=settings.claude_model,
                max_tokens=2000,
                system=[{"type": "text", "text": _SYSTEM,
                         "cache_control": {"type": "ephemeral"}}],
                messages=[{"role": "user", "content": user}],
            )
            data = _parse(msg.content[0].text)
        except Exception:
            return _fallback(slide, refs, idx)

    valid_refs = {r["ref"] for r in refs}
    segments = []
    for i, seg in enumerate(data.get("segments", []), 1):
        if not isinstance(seg, dict):
            continue
        ref = seg.get("ref")
        if ref not in valid_refs:      # 잘못된 ref는 버림 (강조 대상 없음 방지)
            continue
        script = (seg.get("script") or "").strip()
        if not script:
            continue
        segments.append({
            "id": f"seg_{len(segments) + 1}",
            "ref": ref,
            "keyword": (seg.get("keyword") or "").strip(),
            "script": script,
            "effect": "highlighter",
        })

    if not segments:
        return _fallback(slide, refs, idx)

    return {
        "slide_index": idx,
        "title": (data.get("title") or slide.get("title") or "").strip(),
        "segments": segments,
    }


def _deck_digest(outline: list) -> str:
    lines = []
    for i, s in enumerate(outline, 1):
        t = s.get("title") or s.get("quote") or s.get("value") or ""
        lines.append(f"{i}. [{s.get('layout','bullets')}] {t}")
    return "\n".join(lines)


async def write_all(
    outline: list,
    lecture_dir: Path,
    *,
    concurrency: int = 4,
    on_progress=None,
) -> list:
    """아웃라인 → 슬라이드별 내레이션. `vision/slide_NNN.json`으로 저장."""
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY 가 설정되지 않았습니다 (.env 확인)")

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    sem = asyncio.Semaphore(concurrency)
    digest = _deck_digest(outline)
    total = len(outline)
    done = [0]

    out_dir = Path(lecture_dir) / "vision"
    out_dir.mkdir(parents=True, exist_ok=True)

    async def run(slide, idx):
        res = await _one(client, slide, idx, total, digest, sem)
        (out_dir / f"slide_{idx:03d}.json").write_text(
            json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8",
        )
        done[0] += 1
        if on_progress:
            await on_progress(done[0], total)
        return res

    results = await asyncio.gather(
        *(run(s, i) for i, s in enumerate(outline, 1))
    )
    return list(results)
