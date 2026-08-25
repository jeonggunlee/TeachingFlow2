"""SVG 다이어그램 레이아웃 — 개념을 그림으로 보여주는 슬라이드.

글머리표 텍스트로는 전달되지 않는 관계(포함·순서·계층·순환)를 SVG로 그린다.
모든 도형에 `data-ref`가 붙어 있어, 내레이션이 다이어그램의 **특정 부분만**
강조할 수 있다 (예: 신경망 그림에서 은닉층만 강조).

색·선은 CSS 클래스(`dg-*`)로 지정하고 실제 값은 design.json에서 오므로,
강의가 진화해도 다이어그램 디자인이 함께 유지된다.
"""
import html
import re
from typing import Optional

W, H = 1680, 700          # 제목 아래 다이어그램 영역 (viewBox 기준)


def _esc(s) -> str:
    return html.escape(str(s) if s is not None else "")


def _svg(body: str, extra: str = "") -> str:
    return (
        f'<svg class="dg" viewBox="0 0 {W} {H}" '
        f'preserveAspectRatio="xMidYMid meet" role="img" {extra}>{body}</svg>'
    )


def _arrow_defs() -> str:
    return (
        '<defs><marker id="dg-arrow" viewBox="0 0 10 10" refX="9" refY="5" '
        'markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
        '<path d="M 0 0 L 10 5 L 0 10 z" class="dg-arrowhead"/></marker></defs>'
    )


def _wrap(text: str, per_line: int) -> list:
    """긴 라벨을 대략적인 글자 수 기준으로 줄바꿈."""
    words = str(text or "").split()
    lines, cur = [], ""
    for w in words:
        if not cur:
            cur = w
        elif len(cur) + 1 + len(w) <= per_line:
            cur += " " + w
        else:
            lines.append(cur); cur = w
    if cur:
        lines.append(cur)
    if not lines:
        lines = [""]
    # 단어 경계가 없는 한국어 장문 대비 — 여전히 길면 강제로 자른다
    out = []
    for ln in lines:
        while len(ln) > per_line * 1.4:
            out.append(ln[:per_line]); ln = ln[per_line:]
        out.append(ln)
    return out[:3]


def _tspans(text: str, x: float, y: float, per_line: int, lh: float) -> str:
    lines = _wrap(text, per_line)
    y0 = y - (len(lines) - 1) * lh / 2
    return "".join(
        f'<tspan x="{x:.0f}" y="{y0 + i * lh:.0f}">{_esc(ln)}</tspan>'
        for i, ln in enumerate(lines)
    )


# ── venn: 포함 관계 / 교집합 ────────────────────────────────────────
def render_venn(s: dict) -> str:
    sets = [x for x in (s.get("sets") or []) if x]
    if not sets:
        return _svg("")
    mode = (s.get("mode") or "nested").lower()
    n = min(len(sets), 3)
    cx, cy = W / 2, H / 2 + 10

    parts = []
    if mode == "overlap" and n >= 2:
        r = 210
        offs = [(-r * 0.55, 0), (r * 0.55, 0), (0, r * 0.62)][:n]
        for i in range(n):
            item = sets[i]
            name = item.get("name") if isinstance(item, dict) else item
            dx, dy = offs[i]
            parts.append(
                f'<g data-ref="v{i+1}" class="dg-part">'
                f'<circle cx="{cx+dx:.0f}" cy="{cy+dy:.0f}" r="{r}" '
                f'class="dg-venn-circle dg-c{i+1}"/>'
                f'<text class="dg-label" text-anchor="middle">'
                f'{_tspans(name, cx + dx * 1.55, cy + dy * 1.5 - (0 if dy else 150), 12, 40)}'
                f'</text></g>'
            )
    else:
        # 중첩(포함) — 바깥이 가장 큰 집합
        rx0, ry0 = 480, 300
        for i in range(n):
            item = sets[i]
            name = item.get("name") if isinstance(item, dict) else item
            note = item.get("note") if isinstance(item, dict) else ""
            k = 1 - i * 0.30
            rx, ry = rx0 * k, ry0 * k
            label_y = cy - ry + 52
            parts.append(
                f'<g data-ref="v{i+1}" class="dg-part">'
                f'<ellipse cx="{cx:.0f}" cy="{cy:.0f}" rx="{rx:.0f}" ry="{ry:.0f}" '
                f'class="dg-venn-ring dg-c{i+1}"/>'
                f'<text class="dg-label" text-anchor="middle" x="{cx:.0f}" y="{label_y:.0f}">'
                f'{_esc(name)}</text>'
                + (f'<text class="dg-sub" text-anchor="middle" x="{cx:.0f}" '
                   f'y="{label_y + 34:.0f}">{_esc(note)}</text>' if note else "")
                + '</g>'
            )
    return _svg("".join(parts))


# ── flow: 순서 흐름 ─────────────────────────────────────────────────
def render_flow(s: dict) -> str:
    steps = [x for x in (s.get("steps") or []) if x]
    if not steps:
        return _svg("")
    n = min(len(steps), 5)
    gap = 46
    bw = (W - gap * (n - 1) - 40) / n
    bh = 240
    y = H / 2 - bh / 2
    parts = [_arrow_defs()]
    for i in range(n):
        item = steps[i]
        name = item.get("name") if isinstance(item, dict) else item
        note = item.get("note") if isinstance(item, dict) else ""
        x = 20 + i * (bw + gap)
        cx = x + bw / 2
        parts.append(
            f'<g data-ref="f{i+1}" class="dg-part">'
            f'<rect x="{x:.0f}" y="{y:.0f}" rx="18" width="{bw:.0f}" height="{bh}" '
            f'class="dg-box"/>'
            f'<circle cx="{cx:.0f}" cy="{y + 54:.0f}" r="26" class="dg-badge"/>'
            f'<text class="dg-badge-num" text-anchor="middle" x="{cx:.0f}" '
            f'y="{y + 64:.0f}">{i+1}</text>'
            f'<text class="dg-label" text-anchor="middle">'
            f'{_tspans(name, cx, y + 132, 10, 38)}</text>'
            + (f'<text class="dg-sub" text-anchor="middle">'
               f'{_tspans(note, cx, y + 196, 14, 30)}</text>' if note else "")
            + '</g>'
        )
        if i < n - 1:
            ax = x + bw + 8
            parts.append(
                f'<line x1="{ax:.0f}" y1="{H/2:.0f}" x2="{ax + gap - 18:.0f}" '
                f'y2="{H/2:.0f}" class="dg-arrow" marker-end="url(#dg-arrow)"/>'
            )
    return _svg("".join(parts))


# ── layers: 계층 구조 (신경망 층 등) ────────────────────────────────
def render_layers(s: dict) -> str:
    layers = [x for x in (s.get("layers") or []) if x]
    if not layers:
        return _svg("")
    n = min(len(layers), 5)
    gap = 26
    bh = (H - gap * (n - 1) - 40) / n
    bw = W * 0.62
    x = (W - bw) / 2
    parts = []
    for i in range(n):
        item = layers[i]
        name = item.get("name") if isinstance(item, dict) else item
        note = item.get("note") if isinstance(item, dict) else ""
        y = 20 + i * (bh + gap)
        parts.append(
            f'<g data-ref="y{i+1}" class="dg-part">'
            f'<rect x="{x:.0f}" y="{y:.0f}" rx="16" width="{bw:.0f}" height="{bh:.0f}" '
            f'class="dg-layer dg-c{(i % 3) + 1}"/>'
            f'<text class="dg-label" text-anchor="start" x="{x + 44:.0f}" '
            f'y="{y + bh/2 + (0 if not note else -8):.0f}" dominant-baseline="middle">'
            f'{_esc(name)}</text>'
            + (f'<text class="dg-sub" text-anchor="start" x="{x + 44:.0f}" '
               f'y="{y + bh/2 + 34:.0f}">{_esc(note)}</text>' if note else "")
            + '</g>'
        )
    return _svg("".join(parts))


# ── cycle: 순환 구조 ────────────────────────────────────────────────
def render_cycle(s: dict) -> str:
    import math
    steps = [x for x in (s.get("steps") or []) if x]
    if not steps:
        return _svg("")
    n = min(len(steps), 5)
    cx, cy, R = W / 2, H / 2, 235
    parts = [_arrow_defs()]

    # 순환 화살표 (배경)
    for i in range(n):
        a0 = -math.pi / 2 + (i + 0.22) * 2 * math.pi / n
        a1 = -math.pi / 2 + (i + 0.78) * 2 * math.pi / n
        x0, y0 = cx + R * math.cos(a0), cy + R * math.sin(a0)
        x1, y1 = cx + R * math.cos(a1), cy + R * math.sin(a1)
        parts.append(
            f'<path d="M {x0:.0f} {y0:.0f} A {R} {R} 0 0 1 {x1:.0f} {y1:.0f}" '
            f'class="dg-arrow" fill="none" marker-end="url(#dg-arrow)"/>'
        )

    rw, rh = 300, 108
    for i in range(n):
        item = steps[i]
        name = item.get("name") if isinstance(item, dict) else item
        a = -math.pi / 2 + i * 2 * math.pi / n
        bx, by = cx + R * math.cos(a), cy + R * math.sin(a)
        parts.append(
            f'<g data-ref="c{i+1}" class="dg-part">'
            f'<rect x="{bx - rw/2:.0f}" y="{by - rh/2:.0f}" rx="16" '
            f'width="{rw}" height="{rh}" class="dg-box"/>'
            f'<text class="dg-label" text-anchor="middle">'
            f'{_tspans(name, bx, by + 8, 11, 36)}</text></g>'
        )
    return _svg("".join(parts))


# ── figure: 자유 형식 SVG 일러스트 ──────────────────────────────────
# Claude가 개념에 맞춰 직접 그린 SVG를 안전하게 삽입한다.
_SVG_ALLOWED = {
    "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline",
    "polygon", "text", "tspan", "defs", "marker", "lineargradient",
    "radialgradient", "stop", "title", "desc", "use", "symbol",
}
_TAG_RE   = re.compile(r"<\s*/?\s*([a-zA-Z][a-zA-Z0-9-]*)")
_EVENT_RE = re.compile(r"\son[a-zA-Z]+\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)", re.I)
_HREF_RE  = re.compile(r"\s(?:xlink:)?href\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)", re.I)
_BAD_BLOCK_RE = re.compile(
    r"<\s*(script|foreignObject|iframe|style|image)\b.*?<\s*/\s*\1\s*>",
    re.I | re.S,
)
_BAD_SELF_RE = re.compile(r"<\s*(script|foreignObject|iframe|image)\b[^>]*/?>", re.I)


def sanitize_svg(raw: str) -> Optional[str]:
    """모델이 만든 SVG에서 스크립트·외부 참조를 제거한다.

    허용 태그만 남기고, 이벤트 핸들러(onclick 등)와 내부 앵커가 아닌 href를 제거.
    안전하게 만들 수 없으면 None.
    """
    if not raw or "<svg" not in raw.lower():
        return None
    s = raw.strip()
    if "```" in s:
        parts = s.split("```")
        s = next((p for p in parts if "<svg" in p.lower()), s)
        if s.lstrip().lower().startswith("svg"):
            s = s.lstrip()[3:]
    i = s.lower().find("<svg")
    j = s.lower().rfind("</svg>")
    if i < 0 or j < 0:
        return None
    s = s[i:j + 6]

    s = _BAD_BLOCK_RE.sub("", s)
    s = _BAD_SELF_RE.sub("", s)
    s = _EVENT_RE.sub("", s)
    # 내부 참조(#id)만 허용
    s = _HREF_RE.sub(lambda m: "" if not m.group(1).strip("\"'").startswith("#") else m.group(0), s)

    for tag in set(t.lower() for t in _TAG_RE.findall(s)):
        if tag not in _SVG_ALLOWED:
            return None
    return s


def render_figure(s: dict) -> str:
    svg = sanitize_svg(s.get("svg") or "")
    caption = s.get("caption") or ""
    if not svg:
        # SVG가 없거나 안전하지 않으면 캡션만이라도 보여준다
        return (f'<p class="dg-caption" data-ref="fig">{_esc(caption)}</p>'
                if caption else "")
    # viewBox가 없으면 기본값을 넣어 스케일이 깨지지 않게 한다
    if "viewbox" not in svg.lower():
        svg = svg.replace("<svg", f'<svg viewBox="0 0 {W} {H}"', 1)
    svg = svg.replace("<svg", '<svg class="dg" preserveAspectRatio="xMidYMid meet"', 1)
    cap = f'<p class="dg-caption">{_esc(caption)}</p>' if caption else ""
    return f'<div class="dg-figure" data-ref="fig">{svg}</div>{cap}'


DIAGRAM_FUNCS = {
    "venn":   render_venn,
    "flow":   render_flow,
    "layers": render_layers,
    "cycle":  render_cycle,
    "figure": render_figure,
}
