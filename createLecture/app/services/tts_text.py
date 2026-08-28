"""수식·기호가 섞인 스크립트를 TTS가 읽을 수 있는 형태로 바꾼다.

edge-tts 한국어 음성은 아래 문자를 **소리 없이 통째로 무시한다**(실측):
  · 아래첨자 ₀-₉ ₙ  →  "h₂ = f(W₂h₁ + b₂)" 가 "h = f(Wh + b)" 와 발음 길이가 같다
  · 위첨자 ² ³ ⁿ
  · 등호 =            →  "a = b" 와 "a b" 의 발음 길이가 같다
  · 화살표 → ←
  · 말줄임표 …
괄호는 "괄호 열고 … 괄호 닫고"로 낭독해 버려서
"역전파(Backpropagation)" 같은 표현이 불필요하게 장황해진다.

그래서 **화면에 보이는 문장(display)** 과 **음성으로 읽는 문장(spoken)** 을 분리한다.
자막 바는 display 를 그대로 쓰고, 타이밍만 spoken 기준으로 계산한 뒤 되돌린다.
`prepare()` 가 그 대응 관계를 함께 돌려준다.

읽는 방식을 바꾸려면 아래 _SYMBOLS 표만 고치면 된다.
"""
import re
from typing import List, Tuple

# ── 기호 → 한국어 낭독 ────────────────────────────────────────────────
# 치환값 양옆에 공백이 붙는다 — 어절이 나뉘어야 또박또박 읽는다.
_SYMBOLS = {
    # 관계
    "=": "이퀄",
    "≈": "약",
    "≠": "같지 않고",
    "≤": "이하",
    "≥": "이상",
    # 연산
    "+": "더하기",
    "−": "빼기",       # U+2212. ASCII '-' 는 하이픈과 구분이 안 되어 건드리지 않는다
    "×": "곱하기",
    "÷": "나누기",
    "⋅": "곱하기",
    "±": "플러스 마이너스",
    # 흐름
    "→": "다음",
    "←": "이전",
    "↔": "양방향",
    # 해석학·집합
    "∑": "시그마",
    "∏": "파이",
    "∫": "적분",
    "√": "루트",
    "∞": "무한대",
    "∂": "편미분",
    "∇": "나블라",
    "∈": "의 원소",
    "∀": "모든",
    "∃": "존재하는",
    # 낭독하면 장황해지는 것들 → 공백(짧은 쉼)으로
    "(": " ", ")": " ",
    "[": " ", "]": " ",
    "{": " ", "}": " ",
    "…": "등등",
    "_": " ",           # w_new → w new
}

# 아래첨자 → 보통 숫자·글자. 먼저 풀어 놓아야 ₌ ₍ ₎ 도 _SYMBOLS 를 탄다.
_SUBSCRIPT = str.maketrans(
    "₀₁₂₃₄₅₆₇₈₉ₐₑₒₓₕₖₗₘₙₚₛₜ₊₋₌₍₎",
    "0123456789aeoxhklmnpst+-=()",
)

# 위첨자는 "제곱"으로 읽어야 뜻이 산다
_SUPERSCRIPT = {
    "²": " 제곱", "³": " 세제곱",
    "⁰": "의 0 제곱", "¹": "의 1 제곱", "⁴": "의 4 제곱", "⁵": "의 5 제곱",
    "⁶": "의 6 제곱", "⁷": "의 7 제곱", "⁸": "의 8 제곱", "⁹": "의 9 제곱",
    "ⁿ": "의 n 제곱",
}

# 결합 문자가 붙은 변수 (x̂, x̄, x̃) 와 완성형 ŷ
_MODIFIERS = {"̂": " 햇", "̄": " 바", "̃": " 틸데"}
_PRECOMPOSED = {"ŷ": "y 햇", "x̂": "x 햇", "ȳ": "y 바", "x̄": "x 바"}

# "W₂h₁" / "W2h1" 처럼 첨자와 다음 변수가 붙어버린 덩어리를 떼어 읽게 한다.
# 앞이 한 글자짜리 변수일 때만 적용해 "GPT4o" 같은 고유명사는 건드리지 않는다.
_STICKY_SUB   = re.compile(r"(?<![A-Za-z])([A-Za-z][₀-₉ₐₑₒₓₕₖₗₘₙₚₛₜ]+)(?=[A-Za-z])")
_STICKY_INDEX = re.compile(r"(?<![A-Za-z])([A-Za-z]\d+)(?=[A-Za-z])")

# 기호만 남아 읽을 것이 없는 어절 (예: "…," → ",")
_PUNCT_ONLY = re.compile(r"^[\s,./;:'\"·`~!?\-]*$")


def to_spoken(text: str) -> str:
    """수식 기호를 한국어 낭독형으로 바꾼 문자열을 돌려준다."""
    for src, dst in _PRECOMPOSED.items():
        text = text.replace(src, dst)
    text = _STICKY_SUB.sub(r"\1 ", text)      # 첨자가 살아 있을 때 끊어야 구분된다
    text = text.translate(_SUBSCRIPT)

    out = []
    for ch in text:
        if ch in _SUPERSCRIPT:
            out.append(_SUPERSCRIPT[ch])
        elif ch in _SYMBOLS:
            out.append(f" {_SYMBOLS[ch]} ")
        elif ch in _MODIFIERS:
            out.append(_MODIFIERS[ch])
        else:
            out.append(ch)

    spoken = _STICKY_INDEX.sub(r"\1 ", "".join(out))
    spoken = re.sub(r"\s+([,.])", r"\1", spoken)   # "등등 ," → "등등,"
    return re.sub(r"\s+", " ", spoken).strip()


def prepare(display_text: str) -> Tuple[List[str], List[List[str]], str]:
    """display 어절 목록 · 어절별 spoken 어절 목록 · 합성용 전체 문장을 돌려준다.

    display 어절 하나가 spoken 어절 여러 개로 늘어날 수 있고
    ("f(W₂h₁" → "f W2 h1", "정답(Output)을" → "정답 Output 을"),
    읽을 것이 없어 빈 목록이 되는 어절도 있다("…,").
    """
    disp = display_text.split()
    groups: List[List[str]] = []
    for token in disp:
        spoken = to_spoken(token)
        groups.append([] if _PUNCT_ONLY.match(spoken) else spoken.split())
    spoken_text = " ".join(t for g in groups for t in g)
    return disp, groups, spoken_text
