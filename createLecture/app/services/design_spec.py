"""슬라이드 시각 디자인 고정(design lock) 스펙.

강의가 CQI를 통해 여러 버전으로 진화해도 **슬라이드 디자인이 흔들리지 않도록**
색·타이포·레이아웃 규칙을 `design.json`에 고정해 두고, 버전마다 그대로 물려준다.

- `load()`   : 강의 디렉터리의 design.json (없으면 기본값)
- `save()`   : 저장
- `carry()`  : 부모 버전의 디자인을 자식 버전으로 그대로 승계
- `rules_prompt()` : Claude 아웃라인 생성/진화 시 주입할 "디자인 고정 규칙" 텍스트
"""
import json
from pathlib import Path

DESIGN_FILE = "design.json"

# 기본 디자인 — slide_renderer의 화이트 톤 미니멀 학술 테마
DEFAULT_DESIGN = {
    "spec_version": 1,
    "theme": "white-minimal-academic",
    "locked": True,
    "brand": "HALLYM EDUTECH",
    "slide_w": 1920,
    "slide_h": 1080,
    "palette": {
        "bg":           "#ffffff",
        "accent":       "#0ea5e9",
        "accent_soft":  "#bae6fd",
        "ink":          "#0f172a",
        "ink_soft":     "#475569",
        "muted":        "#94a3b8",
        "panel":        "#f8fafc",
        "panel_border": "#e2e8f0",
    },
    "font_stack": (
        "'Pretendard Variable', 'Pretendard', 'Noto Sans KR', "
        "'Noto Sans CJK KR', 'Apple SD Gothic Neo', 'Malgun Gothic', "
        "system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    ),
    # 구조 규칙 — 진화할 때도 이 리듬을 유지한다
    "layout_rules": [
        "표지(title) 슬라이드는 맨 처음 정확히 1장",
        "마무리(closing) 슬라이드는 맨 끝 정확히 1장",
        "본문은 bullets 위주, section·two_col·quote·stat을 섞어 리듬을 준다",
        "같은 레이아웃이 3장 이상 연속되지 않게 한다",
        "bullets는 3~5개, 각 80자 이내 키워드 중심",
        "two_col의 각 컬럼 points는 2~4개",
        "stat의 value는 8자 이내",
        "모든 텍스트는 한국어",
        "관계(포함·순서·계층·순환)를 설명할 때는 글머리표 대신 다이어그램 레이아웃을 쓴다",
        "다이어그램은 전체의 1/4 안팎으로 — 너무 많으면 오히려 산만해진다",
    ],
}

# 허용 레이아웃 (slide_renderer와 동기)
LAYOUTS = [
    "title", "section", "bullets", "two_col", "quote", "stat", "closing",
    # 다이어그램 (SVG) — 관계를 그림으로 보여준다
    "venn", "flow", "layers", "cycle", "figure",
]


# 다이어그램 작도 규칙 — 최초 생성과 CQI 진화 **양쪽 프롬프트에 항상 주입**된다.
# 여기 한 곳만 고치면 모든 슬라이드 생성 경로에 반영된다.
DIAGRAM_RULES = """── 다이어그램 작도 규칙 (venn·flow·layers·cycle·figure 공통) ──
- 관계(포함·순서·계층·순환)가 나오면 글머리표로 나열하지 말고 다이어그램을 쓸 것
- figure(직접 그린 SVG)는 다음을 반드시 지킬 것:
  · viewBox="0 0 1680 700" 좌표계를 쓸 것
  · **캔버스를 꽉 채울 것** — 도형이 x 40~1640, y 40~660 범위에 고르게 퍼지게 하고
    가운데에 작게 모아 그리지 말 것 (강의실 뒷자리에서도 보여야 한다)
  · 글자는 <text>로, font-size는 최소 30, 핵심 라벨은 36~48
  · 도형 stroke-width 3~5, 원은 반지름 70 이상, 사각형은 높이 120 이상
  · <script>·<foreignObject>·<image>·외부 링크 금지 (시스템이 제거한다)
  · 색은 강조색과 회색 계열만 사용할 것
  · 도형 15개 이내로, 지나치게 복잡하게 그리지 말 것"""

def _path(lecture_dir: Path) -> Path:
    return Path(lecture_dir) / DESIGN_FILE


def _merge(base: dict, override: dict) -> dict:
    """얕은 2단계 병합 — palette 등 중첩 dict는 키 단위로 덮어쓴다."""
    out = json.loads(json.dumps(base, ensure_ascii=False))
    for k, v in (override or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k].update(v)
        else:
            out[k] = v
    return out


def load(lecture_dir: Path) -> dict:
    """강의의 디자인 스펙을 읽는다. 없으면 기본 디자인."""
    p = _path(lecture_dir)
    if not p.exists():
        return json.loads(json.dumps(DEFAULT_DESIGN, ensure_ascii=False))
    try:
        return _merge(DEFAULT_DESIGN, json.loads(p.read_text(encoding="utf-8")))
    except Exception:
        return json.loads(json.dumps(DEFAULT_DESIGN, ensure_ascii=False))


def save(lecture_dir: Path, design: dict) -> dict:
    """디자인 스펙을 저장하고 정규화된 결과를 반환."""
    merged = _merge(DEFAULT_DESIGN, design or {})
    _path(lecture_dir).write_text(
        json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8",
    )
    return merged


def carry(src_dir: Path, dst_dir: Path) -> dict:
    """부모 버전의 디자인을 자식 버전으로 그대로 승계 (진화해도 디자인 유지)."""
    design = load(src_dir)
    return save(dst_dir, design)


def rules_prompt(design: dict) -> str:
    """Claude에게 주입할 디자인 고정 규칙 텍스트.

    아웃라인을 새로 만들 때도, CQI로 진화시킬 때도 동일하게 사용해
    버전 간 시각적 일관성을 유지한다.
    """
    d = design or DEFAULT_DESIGN
    pal = d.get("palette", {})
    lines = [
        "── 디자인 고정 규칙 (반드시 준수, 변경 금지) ──",
        f"테마: {d.get('theme')} — 화이트 배경의 미니멀 학술 슬라이드",
        f"강조색 {pal.get('accent')} / 본문색 {pal.get('ink')} / 배경 {pal.get('bg')}",
        f"허용 레이아웃은 다음 {len(LAYOUTS)}종뿐: {', '.join(LAYOUTS)}",
        "이 레이아웃 외의 새 layout 값을 만들어내지 말 것",
        "색상·폰트·여백은 시스템이 고정하므로 JSON에 스타일 필드를 넣지 말 것",
        "",
        "구조 규칙:",
    ]
    lines += [f"- {r}" for r in d.get("layout_rules", [])]
    lines += ["", DIAGRAM_RULES]
    return "\n".join(lines)
