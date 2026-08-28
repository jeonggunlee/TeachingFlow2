"""프롬프트 → 슬라이드 아웃라인(Claude API) → HTML 프래그먼트.

Claude Web 수준 디자인을 목표로 한 화이트 톤 미니멀 슬라이드 렌더러.
슬라이드는 래스터 이미지가 아니라 HTML로 저장되어 플레이어에서 라이브 DOM으로
렌더된다. 덕분에 강조 효과를 좌표가 아닌 실제 텍스트 요소에 적용할 수 있다.

레이아웃 종류 (12):
  - title     표지 (제목 + 부제 + 액센트 바)
  - section   섹션 구분 (큰 번호 + 섹션 제목)
  - bullets   본문 (제목 + 불릿 리스트)
  - two_col   2단 비교 (좌·우 컬럼)
  - quote     인용 (큰 따옴표 + 본문 + 출처)
  - stat      통계 강조 (큰 수치 + 라벨 + 설명)
  - closing   마무리 (큰 메시지 + 부가)
  - venn      포함·교집합 관계 (SVG)
  - flow      순서·절차 (SVG)
  - layers    계층 구조 (SVG)
  - cycle     순환 과정 (SVG)
  - figure    자유 형식 개념도 (모델이 그린 SVG, 위생 처리)
"""

import asyncio
import html
import json
import re
from pathlib import Path
from typing import Optional

from anthropic import AsyncAnthropic

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

── 다이어그램 레이아웃 (개념을 그림으로) ──
말로 설명하면 장황해지는 관계는 아래 레이아웃으로 그림을 그리세요.

8. {"layout":"venn","title":"...","mode":"nested",
      "sets":[{"name":"인공지능","note":"가장 넓은 개념"},{"name":"머신러닝"},{"name":"딥러닝"}]}
   → 포함 관계(A ⊃ B ⊃ C)는 mode:"nested", 교집합은 mode:"overlap". sets는 2~3개
   → 바깥(넓은 개념)부터 순서대로 나열

9. {"layout":"flow","title":"...",
      "steps":[{"name":"순전파","note":"예측값 계산"},{"name":"손실 계산"},{"name":"역전파"}]}
   → 순서·절차·파이프라인. steps 2~5개, name은 짧게(10자 내외)

10. {"layout":"layers","title":"...",
      "layers":[{"name":"입력층","note":"특징 벡터"},{"name":"은닉층"},{"name":"출력층"}]}
   → 계층 구조(신경망 층, 스택, 추상화 단계). 위에서 아래로. 2~5개

11. {"layout":"cycle","title":"...",
      "steps":[{"name":"측정"},{"name":"분석"},{"name":"개선"}]}
   → 반복되는 순환 과정. steps 3~5개

12. {"layout":"figure","title":"...","caption":"한 줄 설명","svg":"<svg viewBox=\"0 0 1680 700\">...</svg>"}
   → 위 형식에 맞지 않는 개념도를 직접 그릴 때.
     작도 규칙은 사용자 메시지의 '다이어그램 작도 규칙'을 그대로 따를 것 (필수)

전체 규칙:
- title 슬라이드는 반드시 정확히 1장(맨 처음)
- closing 슬라이드는 반드시 정확히 1장(맨 끝)
- 그 사이는 bullets 위주, section·two_col·quote·stat을 적절히 섞어 리듬 부여
- **포함·순서·계층·순환 관계가 나오면 글머리표로 나열하지 말고 다이어그램을 쓸 것**
- 다이어그램은 전체 슬라이드의 1/4 안팎 (예: 8장이면 2장 내외)
- 같은 레이아웃이 3장 이상 연속되지 않도록 분배
- 한국어로 작성
- 슬라이드 수가 지정되면 정확히 그 수, 미지정 시 8~14장 사이에서 내용에 맞게 결정
""".strip()


# ── Claude API: 아웃라인 추출 ────────────────────────────────────────
async def _outline(prompt: str, num_slides: Optional[int],
                   design: Optional[dict] = None) -> list:
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY 가 설정되지 않았습니다 (.env 확인)")

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    # 디자인 고정 규칙 + 다이어그램 작도 규칙은 design 유무와 무관하게 항상 주입한다.
    # (design이 없으면 rules_prompt가 기본 디자인으로 채운다)
    from app.services.design_spec import rules_prompt
    lines = [rules_prompt(design), ""]
    lines += ["교수자 강의 프롬프트:", prompt.strip()]
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


def _css(design: Optional[dict] = None) -> str:
    """디자인 스펙으로 슬라이드 CSS를 만든다.

    design 이 None 이면 모듈 기본 토큰을 사용한다. 강의가 여러 버전으로 진화해도
    같은 design.json 을 넘기므로 시각 디자인이 그대로 유지된다.
    """
    d = design or {}
    pal = d.get("palette", {})
    accent       = pal.get("accent",       ACCENT)
    accent_soft  = pal.get("accent_soft",  ACCENT_SOFT)
    ink          = pal.get("ink",          INK)
    ink_soft     = pal.get("ink_soft",     INK_SOFT)
    muted        = pal.get("muted",        MUTED)
    panel        = pal.get("panel",        PANEL)
    panel_border = pal.get("panel_border", PANEL_BORDER)
    bg           = pal.get("bg",           "#ffffff")
    slide_w      = d.get("slide_w", SLIDE_W)
    slide_h      = d.get("slide_h", SLIDE_H)
    font_stack   = d.get("font_stack") or (
        "'Pretendard Variable', 'Pretendard', 'Noto Sans KR', "
        "'Noto Sans CJK KR', 'Apple SD Gothic Neo', 'Malgun Gothic', "
        "system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    )
    return _CSS_TMPL.format(
        SLIDE_W=slide_w, SLIDE_H=slide_h, FONT_STACK=font_stack, BG=bg,
        ACCENT=accent, ACCENT_SOFT=accent_soft, INK=ink, INK_SOFT=ink_soft,
        MUTED=muted, PANEL=panel, PANEL_BORDER=panel_border,
    )


# 이 스타일시트는 플레이어 페이지에도 함께 로드되므로 모든 규칙을
# .slide 안으로 한정한다 (호스트 페이지 레이아웃 오염 방지).
_CSS_TMPL = """
.slide, .slide * {{ box-sizing: border-box; margin: 0; padding: 0; }}
.slide {{
  width: {SLIDE_W}px; height: {SLIDE_H}px;
  padding: 96px 120px;
  position: relative; display: flex; flex-direction: column;
  font-family: {FONT_STACK};
  color: {INK}; background: {BG}; overflow: hidden;
  -webkit-font-smoothing: antialiased;
  text-rendering: geometricPrecision;
  font-feature-settings: 'kern', 'ss01';
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
/* ── 다이어그램 (SVG) ───────────────────────── */
.lyt-venn, .lyt-flow, .lyt-layers, .lyt-cycle, .lyt-figure {{ gap: 12px; }}
.lyt-venn .heading, .lyt-flow .heading, .lyt-layers .heading,
.lyt-cycle .heading, .lyt-figure .heading {{
  font-size: 58px; font-weight: 800; letter-spacing: -0.015em;
  color: {INK}; flex-shrink: 0;
}}
.lyt-venn .heading::after, .lyt-flow .heading::after, .lyt-layers .heading::after,
.lyt-cycle .heading::after, .lyt-figure .heading::after {{
  content: ''; display: block;
  width: 80px; height: 5px; margin-top: 20px;
  background: {ACCENT}; border-radius: 3px;
}}
.dg-wrap {{
  flex: 1; min-height: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 14px;
}}
.dg {{ width: 100%; height: 100%; max-height: 100%; overflow: visible; display: block; }}
/* figure 레이아웃만 .dg-wrap 안에 그림+캡션 두 개가 들어간다.
   flex-direction 이 row 면 둘이 나란히 놓여 그림이 절반 이하로 줄어든다. */
.dg-figure {{
  flex: 1; width: 100%; min-height: 0; display: flex;
  align-items: center; justify-content: center;
}}

/* 도형 */
.dg-box {{ fill: {PANEL}; stroke: {PANEL_BORDER}; stroke-width: 2; }}
.dg-layer {{ stroke-width: 2; }}
.dg-venn-ring {{ fill: none; stroke-width: 4; }}
.dg-venn-circle {{ fill-opacity: .16; stroke-width: 4; }}
.dg-badge {{ fill: {ACCENT}; }}
.dg-badge-num {{ fill: #fff; font-size: 26px; font-weight: 800; }}
.dg-arrow {{ stroke: {MUTED}; stroke-width: 3.5; fill: none; }}
.dg-arrowhead {{ fill: {MUTED}; }}

/* 색상 변주 — 집합·층 구분 */
.dg-c1 {{ stroke: {ACCENT}; fill: {ACCENT}; }}
.dg-c2 {{ stroke: {INK_SOFT}; fill: {INK_SOFT}; }}
.dg-c3 {{ stroke: {ACCENT_SOFT}; fill: {ACCENT_SOFT}; }}
.dg-layer.dg-c1 {{ fill: {ACCENT}; fill-opacity: .14; }}
.dg-layer.dg-c2 {{ fill: {INK_SOFT}; fill-opacity: .10; }}
.dg-layer.dg-c3 {{ fill: {ACCENT_SOFT}; fill-opacity: .28; }}
.dg-venn-ring.dg-c1 {{ fill: {ACCENT}; fill-opacity: .07; }}
.dg-venn-ring.dg-c2 {{ fill: {INK_SOFT}; fill-opacity: .07; }}
.dg-venn-ring.dg-c3 {{ fill: {ACCENT_SOFT}; fill-opacity: .22; }}

/* 글자 */
.dg-label {{ fill: {INK}; font-size: 32px; font-weight: 700; }}
.dg-sub   {{ fill: {INK_SOFT}; font-size: 24px; font-weight: 400; }}
.dg-caption {{
  font-size: 26px; color: {INK_SOFT}; text-align: center; margin-top: 8px;
}}

.lyt-closing .closing-subtitle {{
  font-size: 40px; color: {INK_SOFT}; max-width: 1400px; line-height: 1.4;
}}
""".strip()


def _render_fragment(slide: dict, idx: int, total: int, brand: str = "") -> str:
    """슬라이드 1장의 HTML 프래그먼트 (스타일 없이 구조만).

    플레이어가 이 조각을 그대로 주입해 **라이브 DOM**으로 렌더한다.
    각 텍스트 요소에는 data-ref가 붙어 있어, 강조 효과를 좌표가 아니라
    실제 DOM 요소에 직접 적용할 수 있다 (폰트·줄바꿈이 달라져도 안 어긋남).
    """
    layout = _normalize_layout(slide.get("layout"))
    body = _LAYOUT_FUNCS[layout](slide)
    page_no = f"{idx + 1:02d} / {total:02d}"
    brand_html = f'<span class="brand">{_esc(brand)}</span>' if brand else ""
    return f"""<div class="slide lyt-{_esc(layout)}">
{body}
{brand_html}<span class="slide-num">{_esc(page_no)}</span>
</div>"""


def _render_html(slide: dict, idx: int, total: int, brand: str = "",
                 design: Optional[dict] = None) -> str:
    """미리보기·검증용 단독 HTML 문서."""
    return f"""<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><style>{_css(design)}</style></head>
<body>{_render_fragment(slide, idx, total, brand)}</body></html>"""


def _render_title(s: dict) -> str:
    return f"""
<div class="accent-bar"></div>
<h1 class="title" data-ref="t">{_esc(s.get("title", "강의 제목"))}</h1>
<p class="subtitle" data-ref="st">{_esc(s.get("subtitle", ""))}</p>
""".strip()


def _render_section(s: dict) -> str:
    no = s.get("section_no") or s.get("no") or ""
    return f"""
<div class="section-no" data-ref="no">{_esc(no)}</div>
<div class="section-title" data-ref="t">{_esc(s.get("title", ""))}</div>
""".strip()


def _render_bullets(s: dict) -> str:
    bullets = s.get("bullets") or []
    if not bullets and s.get("content"):
        bullets = [str(s["content"])]
    li_html = "\n".join(
        f'  <li data-ref="b{i}">{_esc(b)}</li>' for i, b in enumerate(bullets, 1)
    )
    return f"""
<h2 class="heading" data-ref="t">{_esc(s.get("title", ""))}</h2>
<ul class="bullets">
{li_html}
</ul>
""".strip()


def _render_two_col(s: dict) -> str:
    L = s.get("left") or {}
    R = s.get("right") or {}

    def col(c, side):
        pts = "\n".join(
            f'      <li data-ref="{side}{i}">{_esc(p)}</li>'
            for i, p in enumerate(c.get("points") or [], 1)
        )
        return f"""<div class="col">
    <h3 data-ref="{side}h">{_esc(c.get("heading", ""))}</h3>
    <ul>
{pts}
    </ul>
  </div>"""

    return f"""
<h2 class="heading" data-ref="t">{_esc(s.get("title", ""))}</h2>
<div class="cols">
  {col(L, "l")}
  {col(R, "r")}
</div>
""".strip()


def _render_quote(s: dict) -> str:
    attr = s.get("attribution") or ""
    attr_html = f'<p class="attribution" data-ref="attr">{_esc(attr)}</p>' if attr else ""
    return f"""
<div class="quote-mark">&ldquo;</div>
<p class="quote-text" data-ref="q">{_esc(s.get("quote", ""))}</p>
{attr_html}
""".strip()


def _render_stat(s: dict) -> str:
    caption = s.get("caption") or ""
    caption_html = (
        f'<p class="stat-caption" data-ref="cap">{_esc(caption)}</p>' if caption else ""
    )
    return f"""
<div class="stat-value" data-ref="val">{_esc(s.get("value", ""))}</div>
<div class="stat-label" data-ref="lbl">{_esc(s.get("label", ""))}</div>
{caption_html}
""".strip()


def _render_closing(s: dict) -> str:
    sub = s.get("subtitle") or ""
    sub_html = (
        f'<p class="closing-subtitle" data-ref="st">{_esc(sub)}</p>' if sub else ""
    )
    return f"""
<div class="accent-bar"></div>
<h1 class="closing-title" data-ref="t">{_esc(s.get("title", "감사합니다"))}</h1>
{sub_html}
""".strip()


def _render_diagram(kind):
    """다이어그램 레이아웃 — 제목 + SVG 그림."""
    def render(s: dict) -> str:
        from app.services.slide_diagrams import DIAGRAM_FUNCS
        title = s.get("title", "")
        head = f'<h2 class="heading" data-ref="t">{_esc(title)}</h2>' if title else ""
        return f'{head}<div class="dg-wrap">{DIAGRAM_FUNCS[kind](s)}</div>'
    return render


_LAYOUT_FUNCS = {
    "title":    _render_title,
    "section":  _render_section,
    "bullets":  _render_bullets,
    "two_col":  _render_two_col,
    "quote":    _render_quote,
    "stat":     _render_stat,
    "closing":  _render_closing,
    # ── 다이어그램 (SVG) ──
    "venn":     _render_diagram("venn"),
    "flow":     _render_diagram("flow"),
    "layers":   _render_diagram("layers"),
    "cycle":    _render_diagram("cycle"),
    "figure":   _render_diagram("figure"),
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


# ── HTML 프래그먼트 출력 ─────────────────────────────────────────────
SLIDE_CSS_NAME = "slide.css"


async def _write_slides(
    outline: list,
    slides_dir: Path,
    brand: str = "",
    on_progress=None,
    design: Optional[dict] = None,
) -> list:
    """슬라이드를 HTML 프래그먼트로 저장한다 (래스터 이미지 생성 없음).

    플레이어가 프래그먼트를 라이브 DOM으로 렌더하므로, 강조 효과를 좌표가 아닌
    실제 텍스트 요소에 적용할 수 있고 확대해도 선명하다.
    공용 스타일은 `slides/slide.css` 한 벌로 저장된다.
    """
    slides_dir.mkdir(parents=True, exist_ok=True)
    (slides_dir / SLIDE_CSS_NAME).write_text(_css(design), encoding="utf-8")

    total = len(outline)
    paths: list = []
    for idx, slide in enumerate(outline):
        out_path = slides_dir / f"slide_{idx + 1:03d}.html"
        out_path.write_text(
            _render_fragment(slide, idx, total, brand=brand), encoding="utf-8",
        )
        paths.append(out_path)
        if on_progress:
            await on_progress(idx + 1, total)

    # 이전 버전이 남긴 PNG 정리 (진화로 장수가 줄어드는 경우 포함)
    for stale in slides_dir.glob("slide_*.png"):
        stale.unlink(missing_ok=True)

    return paths


# ── Public API ───────────────────────────────────────────────────────
async def generate(
    prompt: str,
    lecture_dir: Path,
    *,
    num_slides: Optional[int] = None,
    brand: Optional[str] = None,
    on_progress=None,
    design: Optional[dict] = None,
) -> list:
    """프롬프트 → 슬라이드 아웃라인 → HTML 프래그먼트.

    slides_dir(`{lecture_dir}/slides/`)에 slide_NNN.html + slide.css를 생성한다.
    프롬프트 원문은 `prompt.txt`, 아웃라인 JSON은 `outline.json`,
    시각 디자인 스펙은 `design.json`으로 함께 보관한다(이후 버전이 그대로 승계).
    """
    from app.services import design_spec

    design = design_spec.save(lecture_dir, design or design_spec.load(lecture_dir))
    outline = await _outline(prompt, num_slides, design=design)

    (lecture_dir / "prompt.txt").write_text(prompt, encoding="utf-8")
    (lecture_dir / "outline.json").write_text(
        json.dumps(outline, ensure_ascii=False, indent=2), encoding="utf-8",
    )

    return await render_outline(
        outline, lecture_dir, brand=brand, on_progress=on_progress, design=design,
    )


async def render_outline(
    outline: list,
    lecture_dir: Path,
    *,
    brand: Optional[str] = None,
    on_progress=None,
    design: Optional[dict] = None,
) -> list:
    """이미 확정된 아웃라인을 HTML로 출력한다 (Claude 호출 없음).

    CQI 진화로 새로 만들어진 아웃라인을 같은 디자인으로 렌더할 때 사용.
    """
    from app.services import design_spec

    design = design or design_spec.load(lecture_dir)
    if brand is None:
        brand = design.get("brand", "HALLYM EDUTECH")

    slides_dir = lecture_dir / "slides"
    return await _write_slides(
        outline, slides_dir, brand=brand, on_progress=on_progress, design=design,
    )
