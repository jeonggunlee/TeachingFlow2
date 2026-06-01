import json
from pathlib import Path

import edge_tts

from app.config import settings


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


async def _synthesize(text: str, mp3_path: Path) -> list[dict]:
    """text → mp3_path 저장 + word 타이밍 목록 반환.
    edge-tts 7.x 한국어: SentenceBoundary → 어절 균등 분배."""
    communicate = edge_tts.Communicate(text, settings.tts_voice)
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

    return _distribute_words(sentences)


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

            if not force and mp3_path.exists() and words_path.exists():
                words = json.loads(words_path.read_text(encoding="utf-8"))
            else:
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
