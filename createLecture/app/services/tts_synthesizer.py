import json
from pathlib import Path
from typing import Optional

import edge_tts

from app.config import settings
from app.services import tts_text


def _distribute_words(sentences: list[dict]) -> list[dict]:
    """
    SentenceBoundary 목록 → 어절 단위 words 목록.
    한국어 edge-tts는 WordBoundary를 제공하지 않으므로
    문장 시간 구간 내 어절을 글자 수 비례로 분배한다.
    """
    words: list[dict] = []
    for sent in sentences:
        start_ms = sent["offset"] / 10_000
        dur_ms   = sent["duration"] / 10_000
        tokens = sent["text"].split()
        if not tokens:
            continue
        char_counts = [max(len(t), 1) for t in tokens]
        total_chars = sum(char_counts)
        cursor = start_ms
        for token, chars in zip(tokens, char_counts):
            token_dur = dur_ms * chars / total_chars
            words.append({
                "text": token,
                "offset_ms": round(cursor, 1),
                "duration_ms": round(token_dur, 1),
            })
            cursor += token_dur
    return words


def _regroup(spoken_words: list[dict], disp: list[str],
             groups: list[list[str]]) -> list[dict]:
    """spoken 어절 타이밍을 display 어절 단위로 되접는다.

    "f(W₂h₁" 은 "f W2 h1" 세 어절로 읽히지만 자막에는 원래 모양으로 나와야 한다.
    → 세 어절의 시간을 합쳐 display 어절 하나에 돌려준다.
    """
    out: list[dict] = []
    i = 0
    cursor = spoken_words[0]["offset_ms"] if spoken_words else 0.0
    for token, group in zip(disp, groups):
        chunk = spoken_words[i:i + len(group)]
        i += len(group)
        if not chunk:                      # 읽을 것이 없는 어절("…,")
            out.append({"text": token, "offset_ms": round(cursor, 1),
                        "duration_ms": 0.0})
            continue
        offset = chunk[0]["offset_ms"]
        duration = sum(w["duration_ms"] for w in chunk)
        cursor = offset + duration
        out.append({"text": token, "offset_ms": round(offset, 1),
                    "duration_ms": round(duration, 1)})
    return out


def _spread(disp: list[str], groups: list[list[str]], total_ms: float) -> list[dict]:
    """정렬이 깨졌을 때의 대비책 — 전체 길이를 발음 글자 수에 비례해 나눈다."""
    weights = [max(sum(len(t) for t in g), 1) if g else 0 for g in groups]
    total_w = sum(weights) or 1
    out, cursor = [], 0.0
    for token, w in zip(disp, weights):
        dur = total_ms * w / total_w
        out.append({"text": token, "offset_ms": round(cursor, 1),
                    "duration_ms": round(dur, 1)})
        cursor += dur
    return out


def _cached_words(words_path: Path, script: str) -> Optional[list]:
    """캐시된 어절 타이밍이 **지금 이 스크립트에서 나온 것**일 때만 돌려준다.

    파일이 있다는 이유만으로 재사용하면 스크립트를 고쳐도 옛 음성이 남고,
    수식 낭독 규칙(tts_text)이 바뀌어도 옛 결과가 그대로 살아남는다.
    자막 어절이 현재 스크립트와 다르면 캐시를 버리고 다시 합성한다.
    """
    try:
        words = json.loads(words_path.read_text(encoding="utf-8"))
    except Exception:
        return None
    if not isinstance(words, list) or not words:
        return None
    if [w.get("text") for w in words] != script.split():
        return None
    return words


async def _synthesize(text: str, mp3_path: Path) -> list[dict]:
    """text → mp3_path 저장 + word 타이밍 목록 반환.

    edge-tts 7.x 한국어: SentenceBoundary → 어절 균등 분배.
    수식 기호는 그대로 넘기면 무음 처리되므로 tts_text 로 낭독형을 만들어 보내고,
    자막에 쓸 텍스트는 원본 어절을 유지한다."""
    disp, groups, spoken_text = tts_text.prepare(text)
    communicate = edge_tts.Communicate(spoken_text or text, settings.tts_voice)
    sentences: list[dict] = []
    mp3_path.parent.mkdir(parents=True, exist_ok=True)

    with open(mp3_path, "wb") as f:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                sentences.append(chunk)
            elif chunk["type"] == "SentenceBoundary":
                sentences.append(chunk)

    spoken_words = _distribute_words(sentences)
    if not disp:
        return spoken_words

    # edge-tts 가 넘긴 문장 텍스트를 우리가 보낸 그대로 되돌려주지 않으면
    # 어절 수가 어긋난다. 그때는 자막이 밀리지 않도록 비례 분배로 물러선다.
    if len(spoken_words) != sum(len(g) for g in groups):
        total = (spoken_words[-1]["offset_ms"] + spoken_words[-1]["duration_ms"]
                 if spoken_words else 0.0)
        return _spread(disp, groups, total)

    return _regroup(spoken_words, disp, groups)


async def synthesize_all(
    vision_results: list[dict],
    lecture_dir: Path,
    *,
    force: bool = False,
    on_progress=None,   # async callable() | None — 세그먼트 완료마다 호출
) -> list[dict]:
    """
    슬라이드 전체 segments를 순서대로 TTS 합성.
    각 MP3 옆에 .words.json 캐시를 저장하고, vision_results에
    audio/duration_ms/words 필드를 추가한 결과를 반환한다.
    """
    audio_dir = lecture_dir / "audio"
    audio_dir.mkdir(exist_ok=True)
    enriched: list[dict] = []

    for slide in vision_results:
        idx = slide["slide_index"]
        new_segs = []

        for seg in slide.get("segments", []):
            seg_id = seg["id"]                                  # e.g. "seg_1"
            seg_num = seg_id.split("_")[-1].zfill(2)           # "1" → "01"
            mp3_name = f"slide_{idx:03d}_seg_{seg_num}.mp3"
            mp3_path = audio_dir / mp3_name
            words_path = mp3_path.with_suffix(".words.json")

            words = None
            if not force and mp3_path.exists() and words_path.exists():
                words = _cached_words(words_path, seg["script"])
            if words is None:
                words = await _synthesize(seg["script"], mp3_path)
                words_path.write_text(
                    json.dumps(words, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )

            duration_ms = (
                (words[-1]["offset_ms"] + words[-1]["duration_ms"]) if words else 0.0
            )
            new_segs.append({
                **seg,
                "audio": f"audio/{mp3_name}",
                "duration_ms": duration_ms,
                "words": words,
            })
            if on_progress:
                await on_progress()

        enriched.append({**slide, "segments": new_segs})

    return enriched
