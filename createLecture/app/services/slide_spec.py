"""슬라이드 PNG → 아웃라인 스펙(outline.json) 역추출 — **레거시 호환 전용**.

현재 강의는 모두 웹 슬라이드로 생성되므로 `outline.json`을 처음부터 갖는다.
이 모듈은 그 이전(PPT 업로드 방식)에 만들어져 슬라이드가 이미지로만 남아 있는
강의를 CQI 진화 사이클에 편입시키기 위한 마이그레이션 경로다.
슬라이드 이미지를 Claude Vision으로 읽어 페이지별 내용을 아웃라인 스펙으로
복원하면, 이후 버전부터는 웹 슬라이드로 렌더되어 정상적으로 진화한다.

`load()`는 저장된 스펙을 읽고, `ensure()`는 없을 때만 역추출한다
(웹 슬라이드로 만든 강의에서는 항상 load 단계에서 끝난다).
"""
import asyncio
import base64
import json
import re
from pathlib import Path
from typing import Optional

from anthropic import AsyncAnthropic

from app.config import settings
from app.services.design_spec import LAYOUTS

_SYSTEM = """당신은 강의 슬라이드를 구조화된 JSON 스펙으로 옮기는 분석가입니다.
슬라이드 이미지 한 장을 보고, 그 안의 내용을 아래 레이아웃 중 하나로 표현하세요.

레이아웃과 필드:
1. {"layout":"title","title":"...","subtitle":"..."}
2. {"layout":"section","section_no":"01","title":"..."}
3. {"layout":"bullets","title":"...","bullets":["...","..."]}
4. {"layout":"two_col","title":"...","left":{"heading":"...","points":[...]},"right":{"heading":"...","points":[...]}}
5. {"layout":"quote","quote":"...","attribution":"..."}
6. {"layout":"stat","value":"95%","label":"...","caption":"..."}
7. {"layout":"closing","title":"...","subtitle":"..."}

규칙:
- 슬라이드에 **실제로 적힌 텍스트**를 최대한 보존해 옮길 것 (내용을 창작하지 말 것)
- 도표·그림만 있어 텍스트가 적으면, 그림이 전달하는 핵심을 bullets로 요약할 것
- 이미지가 표지처럼 보이면 title, 마무리처럼 보이면 closing 사용
- 위 7종 외의 layout 값을 만들지 말 것
- 순수 JSON 객체 하나만 출력 (코드블록·설명 금지)
""".strip()


def _b64(p: Path) -> str:
    return base64.standard_b64encode(p.read_bytes()).decode()


def _parse(raw: str) -> dict:
    raw = raw.strip()
    if "```" in raw:
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        return json.loads(raw.strip())
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if m:
            return json.loads(m.group())
        raise


async def _one(client: AsyncAnthropic, path: Path, idx: int, total: int,
               sem: asyncio.Semaphore) -> dict:
    async with sem:
        try:
            msg = await client.messages.create(
                model=settings.claude_model,
                max_tokens=1500,
                system=[{"type": "text", "text": _SYSTEM,
                         "cache_control": {"type": "ephemeral"}}],
                messages=[{"role": "user", "content": [
                    {"type": "image", "source": {
                        "type": "base64", "media_type": "image/png",
                        "data": _b64(path)}},
                    {"type": "text",
                     "text": f"이 슬라이드({idx + 1}/{total})를 아웃라인 JSON으로 옮기세요."},
                ]}],
            )
            spec = _parse(msg.content[0].text)
        except Exception:
            # 실패 시에도 파이프라인이 멈추지 않도록 최소 스펙으로 대체
            spec = {"layout": "bullets", "title": f"슬라이드 {idx + 1}", "bullets": []}

    if spec.get("layout") not in LAYOUTS:
        spec["layout"] = "bullets"
    return spec


async def extract(
    slides: list,
    lecture_dir: Path,
    *,
    concurrency: int = 4,
    on_progress=None,
) -> list:
    """슬라이드 PNG 목록 → 아웃라인 스펙 배열. outline.json으로 저장."""
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY 가 설정되지 않았습니다 (.env 확인)")

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    sem = asyncio.Semaphore(concurrency)
    total = len(slides)

    done = [0]

    async def run(p: Path, i: int) -> dict:
        spec = await _one(client, p, i, total, sem)
        done[0] += 1
        if on_progress:
            await on_progress(done[0], total)
        return spec

    outline = list(await asyncio.gather(*(run(Path(p), i) for i, p in enumerate(slides))))

    (Path(lecture_dir) / "outline.json").write_text(
        json.dumps(outline, ensure_ascii=False, indent=2), encoding="utf-8",
    )
    return outline


def load(lecture_dir: Path) -> Optional[list]:
    """저장된 아웃라인 스펙 (없으면 None)."""
    p = Path(lecture_dir) / "outline.json"
    if not p.exists():
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else None
    except Exception:
        return None


async def ensure(lecture_dir: Path, *, on_progress=None) -> list:
    """아웃라인 스펙을 보장한다 — 없으면 슬라이드 이미지에서 역추출."""
    existing = load(lecture_dir)
    if existing:
        return existing

    slides = sorted((Path(lecture_dir) / "slides").glob("slide_*.png"))
    if not slides:
        raise RuntimeError("슬라이드 이미지가 없어 아웃라인을 추출할 수 없습니다.")
    return await extract(slides, lecture_dir, on_progress=on_progress)
