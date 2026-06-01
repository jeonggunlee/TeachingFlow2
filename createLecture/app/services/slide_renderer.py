"""프롬프트 → 슬라이드 아웃라인(Claude API) → HTML+CSS → PNG (Playwright).

Claude Web 수준 디자인을 목표로 한 화이트 톤 미니멀 슬라이드 렌더러.
.pptx 파일을 만들지 않고 슬라이드 이미지를 직접 생성한다.

레이아웃 종류 (7):
  - title     표지 (제목 + 부제 + 액센트 바)
  - section   섹션 구분 (큰 번호 + 섹션 제목)
  - bullets   본문 (제목 + 불릿 리스트)
  - two_col   2단 비교 (좌·우 컬럼)
  - quote     인용 (큰 따옴표 + 본문 + 출처)
  - stat      통계 강조 (큰 수치 + 라벨 + 설명)
  - closing   마무리 (큰 메시지 + 부가)
"""

import asyncio
import html
import json
import re
from pathlib import Path
from typing import Optional

from anthropic import AsyncAnthropic
from playwright.async_api import async_playwright

from app.config import settings

# ── 디자인 토큰 ──────────────────────────────────────────────────────
SLIDE_W = 1920
SLIDE_H = 1080
ACCENT = "#0ea5e9"
ACCENT_SOFT = "#bae6fd"
INK = "#0f172a"
INK_SOFT = "#475569"
MUTED = "#94a3b8"
PANEL = "#f8fafc"
PANEL_BORDER = "#e2e8f0"

# ── 시스템 프롬프트 ──────────────────────────────────────────────────
_SYSTEM = """당신은 대학 강의 슬라이드 디자이너입니다.
교수자 프롬프트를 받아 화이트 톤·미니멀·학술적인 슬라이드 구조를 설계합니다.

반드시 아래 규칙을 따르세요:
- 출력은 순수 JSON 배열만 (코드블록·설명 일절 금지)
- 각 슬라이드는 layout 필드 + 해당 레이아웃 전용 필드 포함

레이아웃 종류와 필수 필드:

1. {"layout":"title","title":"강의 제목","subtitle":"한 줄 부제"}
   → 첫 슬라이드는 반드시 이 타입

2. {"layout":"section","section_no":"01","title":"섹션 제목"}
   → 큰 주제가 바뀌는 지점에서 사용 (선택)

3. {"layout":"bullets","title":"슬라이드 제목","bullets":["...","..."]}
   → 가장 일반적인 본문. bullets 3~5개, 각 80자 이내 키워드 중심

4. {"layout":"two_col","title":"슬라이드 제목",
       "left":{"heading":"...","points":["...","..."]},
       "right":{"heading":"...","points":["...","..."]}}
   → 비교·대조 시. points는 각 컬럼 2~4개

5. {"layout":"quote","quote":"인용문 본문","attribution":"출처"}
   → 핵심 인용·격언·정의. attribution은 선택

6. {"layout":"stat","value":"95%","label":"한 줄 라벨","caption":"부가 설명 한 문장"}
   → 통계·수치 강조. value는 8자 이내 (예: "95%", "3×10⁸", "30년")

7. {"layout":"closing","title":"마무리 메시지","subtitle":"부가 메시지"}
   → 마지막 슬라이드. subtitle은 선택

전체 규칙:
- title 슬라이드는 반드시 정확히 1장(맨 처음)
- closing 슬라이드는 반드시 정확히 1장(맨 끝)
- 그 사이는 bullets 위주, section·two_col·quote·stat을 적절히 섞어 리듬 부여
- 같은 레이아웃이 3장 이상 연속되지 않도록 분배
- 한국어로 작성
- 슬라이드 수가 지정되면 정확히 그 수, 미지정 시 8~14장 사이에서 내용에 맞게 결정
""".strip()


# ── Claude API: 아웃라인 추출 ────────────────────────────────────────
async def _outline(prompt: str, num_slides: Optional[int]) -> list:
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY 가 설정되지 않았습니다 (.env 확인)")

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    lines = ["교수자 강의 프롬프트:", prompt.strip()]
    if num_slides and num_slides > 0:
        lines.append("")
        lines.append(f"슬라이드 수: 표지·마무리 포함 정확히 {num_slides}장.")
    lines.append("")
    lines.append("위 프롬프트를 바탕으로 슬라이드 구조 JSON 배열만 출력하세요.")
    user_msg = "\n".join(lines)

    msg = await client.messages.create(
        model=settings.claude_model,
        max_tokens=8000,
        system=[{"type": "text", "text": _SYSTEM, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": user_msg}],
    )
    raw = msg.content[0].text.strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\[.*\]", raw, re.DOTALL)
        if not m:
            raise ValueError(f"슬라이드 outline 응답에서 JSON 배열 추출 실패: {raw[:300]!r}")
        data = json.loads(m.group())

    if not isinstance(data, list) or not data:
        raise ValueError("슬라이드 outline 응답이 비어 있거나 배열이 아닙니다.")
    return data


# ── HTML 렌더링 ──────────────────────────────────────────────────────
def _esc(s) -> str:
    return html.escape(str(s) if s is not None else "")


_BASE_CSS = f"""
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
html, body {{
  width: {SLIDE_W}px; height: {SLIDE_H}px;
  font-family: 'Pretendard Variable', 'Pretendard', 'Noto Sans KR',
               'Noto Sans CJK KR', 'Apple SD Gothic Neo', 'Malgun Gothic',
               system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  color: {INK}; background: #ffffff; overflow: hidden;
  -webkit-font-smoothing: antialiased;
  text-rendering: geometricPrecision;
  font-feature-settings: 'kern', 'ss01';
}}
.slide {{
  width: 100%; height: 100%;
  padding: 96px 120px;
  position: relative; display: flex; flex-direction: column;
}}
.slide-num {{
  position: absolute; right: 64px; bottom: 48px;
  font-size: 22px; color: {MUTED}; font-weight: 500;
  letter-spacing: 0.08em; font-variant-numeric: tabular-nums;
}}
.brand {{
  position: absolute; left: 64px; bottom: 48px;
  font-size: 18px; color: {MUTED}; font-weight: 700;
  letter-spacing: 0.12em; text-transform: uppercase;
}}
.accent-bar {{
  width: 110px; height: 7px;
  background: {ACCENT}; border-radius: 4px;
}}

/* ── Layout: title ───────────────────────────── */
.lyt-title {{ justify-content: center; align-items: flex-start; gap: 44px; }}
.lyt-title .accent-bar {{ width: 160px; height: 9px; }}
.lyt-title .title {{
  font-size: 116px; font-weight: 800; letter-spacing: -0.025em;
  line-height: 1.1; color: {INK}; max-width: 1500px;
}}
.lyt-title .subtitle {{
  font-size: 44px; font-weight: 400; color: {INK_SOFT};
  line-height: 1.4; max-width: 1500px;
}}

/* ── Layout: section ─────────────────────────── */
.lyt-section {{ justify-content: center; gap: 24px; }}
.lyt-section .section-no {{
  font-size: 220px; font-weight: 900; line-height: 0.95;
  color: {ACCENT}; letter-spacing: -0.05em;
}}
.lyt-section .section-title {{
  font-size: 88px; font-weight: 700;
  color: {INK}; letter-spacing: -0.02em;
}}

/* ── Layout: bullets ─────────────────────────── */
.lyt-bullets .heading {{
  font-size: 64px; font-weight: 800; letter-spacing: -0.015em;
  line-height: 1.2; color: {INK};
}}
.lyt-bullets .heading::after {{
  content: ''; display: block;
  width: 80px; height: 5px; margin-top: 26px;
  background: {ACCENT}; border-radius: 3px;
}}
.lyt-bullets .bullets {{
  margin-top: 60px; display: flex; flex-direction: column; gap: 32px;
}}
.lyt-bullets .bullets li {{
  list-style: none; font-size: 38px; line-height: 1.45; font-weight: 500;
  color: {INK}; padding-left: 56px; position: relative; max-width: 1500px;
}}
.lyt-bullets .bullets li::before {{
  content: ''; position: absolute; left: 0; top: 20px;
  width: 18px; height: 18px; border-radius: 5px;
  background: {ACCENT};
}}

/* ── Layout: two_col ─────────────────────────── */
.lyt-two_col .heading {{
  font-size: 60px; font-weight: 800; letter-spacing: -0.015em;
  color: {INK};
}}
.lyt-two_col .heading::after {{
  content: ''; display: block;
  width: 80px; height: 5px; margin-top: 22px;
  background: {ACCENT}; border-radius: 3px;
}}
.lyt-two_col .cols {{
  margin-top: 56px; display: grid; grid-template-columns: 1fr 1fr;
  gap: 56px; flex: 1; min-height: 0;
}}
.lyt-two_col .col {{
  background: {PANEL}; border: 1px solid {PANEL_BORDER}; border-radius: 28px;
  padding: 48px; display: flex; flex-direction: column; gap: 26px;
}}
.lyt-two_col .col h3 {{
  font-size: 40px; font-weight: 700; color: {INK};
  padding-bottom: 18px; border-bottom: 4px solid {ACCENT};
}}
.lyt-two_col .col ul {{ display: flex; flex-direction: column; gap: 20px; }}
.lyt-two_col .col li {{
  list-style: none; font-size: 30px; line-height: 1.5;
  padding-left: 32px; position: relative; color: {INK_SOFT};
}}
.lyt-two_col .col li::before {{
  content: '—'; position: absolute; left: 0; top: 0;
  color: {ACCENT}; font-weight: 700;
}}

/* ── Layout: quote ───────────────────────────── */
.lyt-quote {{
  justify-content: center; align-items: center; text-align: center;
  gap: 36px; padding: 96px 200px;
}}
.lyt-quote .quote-mark {{
  font-size: 240px; font-weight: 900; line-height: 0.5;
  color: {ACCENT_SOFT}; height: 100px;
  font-family: Georgia, serif;
}}
.lyt-quote .quote-text {{
  font-size: 58px; font-weight: 500; line-height: 1.4;
  color: {INK}; max-width: 1500px;
}}
.lyt-quote .attribution {{
  font-size: 32px; color: {INK_SOFT}; margin-top: 12px;
}}
.lyt-quote .attribution::before {{ content: '— '; color: {ACCENT}; font-weight: 700; }}

/* ── Layout: stat ────────────────────────────── */
.lyt-stat {{
  justify-content: center; align-items: center; text-align: center;
  gap: 28px;
}}
.lyt-stat .stat-value {{
  font-size: 320px; font-weight: 900; line-height: 0.95;
  color: {ACCENT}; letter-spacing: -0.045em;
  font-variant-numeric: tabular-nums;
}}
.lyt-stat .stat-label {{
  font-size: 60px; font-weight: 800; color: {INK};
  letter-spacing: -0.015em; margin-top: 8px;
}}
.lyt-stat .stat-caption {{
  font-size: 32px; color: {INK_SOFT}; max-width: 1300px;
  line-height: 1.5;
}}

/* ── Layout: closing ─────────────────────────── */
.lyt-closing {{
  justify-content: center; align-items: center; text-align: center; gap: 36px;
}}
.lyt-closing .accent-bar {{ width: 220px; height: 9px; }}
.lyt-closing .closing-title {{
  font-size: 128px; font-weight: 800; letter-spacing: -0.025em;
  color: {INK};
}}
.lyt-closing .closing-subtitle {{
  font-size: 40px; color: {INK_SOFT}; max-width: 1400px; line-height: 1.4;
}}
""".strip()


def _render_html(slide: dict, idx: int, total: int, brand: str = "") -> str:
    layout = _normalize_layout(slide.get("layout"))
    body = _LAYOUT_FUNCS[layout](slide)
    page_no = f"{idx + 1:02d} / {total:02d}"
    brand_html = f'<span class="brand">{_esc(brand)}</span>' if brand else ""
    return f"""<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><style>{_BASE_CSS}</style></head>
<body><div class="slide lyt-{_esc(layout)}">
{body}
{brand_html}<span class="slide-num">{_esc(page_no)}</span>
</div></body></html>"""


def _render_title(s: dict) -> str:
    return f"""
<div class="accent-bar"></div>
<h1 class="title">{_esc(s.get("title", "강의 제목"))}</h1>
<p class="subtitle">{_esc(s.get("subtitle", ""))}</p>
""".strip()


def _render_section(s: dict) -> str:
    no = s.get("section_no") or s.get("no") or ""
    return f"""
<div class="section-no">{_esc(no)}</div>
<div class="section-title">{_esc(s.get("title", ""))}</div>
""".strip()


def _render_bullets(s: dict) -> str:
    bullets = s.get("bullets") or []
    if not bullets and s.get("content"):
        bullets = [str(s["content"])]
    li_html = "\n".join(f"  <li>{_esc(b)}</li>" for b in bullets)
    return f"""
<h2 class="heading">{_esc(s.get("title", ""))}</h2>
<ul class="bullets">
{li_html}
</ul>
""".strip()


def _render_two_col(s: dict) -> str:
    L = s.get("left") or {}
    R = s.get("right") or {}

    def col(c):
        pts = "\n".join(f"      <li>{_esc(p)}</li>" for p in (c.get("points") or []))
        return f"""<div class="col">
    <h3>{_esc(c.get("heading", ""))}</h3>
    <ul>
{pts}
    </ul>
  </div>"""

    return f"""
<h2 class="heading">{_esc(s.get("title", ""))}</h2>
<div class="cols">
  {col(L)}
  {col(R)}
</div>
""".strip()


def _render_quote(s: dict) -> str:
    attr = s.get("attribution") or ""
    attr_html = f'<p class="attribution">{_esc(attr)}</p>' if attr else ""
    return f"""
<div class="quote-mark">&ldquo;</div>
<p class="quote-text">{_esc(s.get("quote", ""))}</p>
{attr_html}
""".strip()


def _render_stat(s: dict) -> str:
    caption = s.get("caption") or ""
    caption_html = f'<p class="stat-caption">{_esc(caption)}</p>' if caption else ""
    return f"""
<div class="stat-value">{_esc(s.get("value", ""))}</div>
<div class="stat-label">{_esc(s.get("label", ""))}</div>
{caption_html}
""".strip()


def _render_closing(s: dict) -> str:
    sub = s.get("subtitle") or ""
    sub_html = f'<p class="closing-subtitle">{_esc(sub)}</p>' if sub else ""
    return f"""
<div class="accent-bar"></div>
<h1 class="closing-title">{_esc(s.get("title", "감사합니다"))}</h1>
{sub_html}
""".strip()


_LAYOUT_FUNCS = {
    "title":    _render_title,
    "section":  _render_section,
    "bullets":  _render_bullets,
    "two_col":  _render_two_col,
    "quote":    _render_quote,
    "stat":     _render_stat,
    "closing":  _render_closing,
}


def _normalize_layout(name) -> str:
    if not name:
        return "bullets"
    key = str(name).strip().lower().replace("-", "_").replace(" ", "_")
    if key in _LAYOUT_FUNCS:
        return key
    if key in {"twocol", "two_column", "compare"}:
        return "two_col"
    return "bullets"


# ── Playwright 렌더링 ────────────────────────────────────────────────
async def _render_pngs(
    outline: list,
    slides_dir: Path,
    brand: str = "",
    on_progress=None,
) -> list:
    slides_dir.mkdir(parents=True, exist_ok=True)
    total = len(outline)
    paths: list = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            args=["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
        )
        try:
            context = await browser.new_context(
                viewport={"width": SLIDE_W, "height": SLIDE_H},
                device_scale_factor=1,
            )
            page = await context.new_page()
            for idx, slide in enumerate(outline):
                html_str = _render_html(slide, idx, total, brand=brand)
                await page.set_content(html_str, wait_until="load")
                # 시스템 폰트가 lazy하게 적용되는 경우 대비
                try:
                    await page.evaluate("document.fonts && document.fonts.ready")
                except Exception:
                    pass
                out_path = slides_dir / f"slide_{idx + 1:03d}.png"
                await page.screenshot(path=str(out_path), full_page=False, omit_background=False)
                paths.append(out_path)
                if on_progress:
                    await on_progress(idx + 1, total)
        finally:
            await browser.close()
    return paths


# ── Public API ───────────────────────────────────────────────────────
async def generate(
    prompt: str,
    lecture_dir: Path,
    *,
    num_slides: Optional[int] = None,
    brand: str = "HALLYM EDUTECH",
    on_progress=None,
) -> list:
    """프롬프트 → 슬라이드 아웃라인 → HTML+CSS → PNG.

    slides_dir(`{lecture_dir}/slides/`)에 slide_NNN.png를 생성한다.
    프롬프트 원문은 `prompt.txt`, 아웃라인 JSON은 `outline.json`으로 함께 보관.
    """
    outline = await _outline(prompt, num_slides)

    (lecture_dir / "prompt.txt").write_text(prompt, encoding="utf-8")
    (lecture_dir / "outline.json").write_text(
        json.dumps(outline, ensure_ascii=False, indent=2), encoding="utf-8",
    )

    slides_dir = lecture_dir / "slides"
    return await _render_pngs(outline, slides_dir, brand=brand, on_progress=on_progress)
