# storage/ — 강의 산출물 저장소

> 백엔드 파이프라인이 만든 슬라이드 이미지·오디오·메타데이터를 강의 단위로 보관. 정적 파일 서빙 루트이기도 함.

---

## 1. 디렉터리 레이아웃

```
storage/
└── lectures/
    └── {lecture_id}/             # YYYY-MM-DD_<uuid8>, 예: 2026-05-21_77c15663
        ├── prompt.txt            # 교수자 강의 프롬프트 원문
        ├── outline.json          # 페이지별 슬라이드 내용 스펙 (CQI 진화의 입력)
        ├── design.json           # 시각 디자인 고정 스펙 (버전 간 승계)
        ├── cqi_ledger.json       # 누적 CQI 지시문 원장 (버전 간 승계)
        ├── slides/
        │   ├── slide_001.png     # 웹 슬라이드 렌더 PNG (1920×1080 px — 16:9)
        │   └── slide_NNN.png
        ├── vision/               # Claude Vision 분석 결과 (캐시)
        │   ├── slide_001.json    # CQI 적용·스크립트 편집 시 덮어쓰기
        │   └── slide_NNN.json
        ├── audio/
        │   ├── slide_001_seg_01.mp3
        │   ├── slide_001_seg_01.words.json   # 어절 타이밍 캐시
        │   └── slide_NNN_seg_MM.mp3 (+ .words.json)
        ├── cqi.txt               # CQI 입력 텍스트 보관 (CQI 없으면 미생성)
        ├── job.err               # 파이프라인 오류 발생 시 생성 (없으면 정상)
        └── lecture.json          # 플레이어가 로드하는 단일 진실 소스
```

- `lecture_id`는 `YYYY-MM-DD_<uuid8>` 형식 (`new_lecture_id()` 자동 생성)
- 각 산출물은 캐시처럼 동작 — 재처리 시 이미 있는 파일은 건너뜀 (`force=False` 기본값)
- `synthesize_all`은 `force=True`로 호출 — 스크립트 변경 반영을 위해 MP3 항상 재생성
- `rebuild-json` 엔드포인트: `vision/` + `audio/` 파일만 읽어 `lecture.json` 재빌드 (TTS 없음)
- 강제 완전 재생성: 해당 디렉터리(`slides/`, `vision/`, `audio/`) 삭제 후 재업로드

### 운영 규칙

- `storage/lectures/` 전체는 런타임 산출물 — `.gitignore`에 추가 (`storage/lectures/.gitkeep`만 보존)
- `job.err` 파일이 존재하면 파이프라인이 실패한 것. SSE `job_error` 이벤트도 함께 발행됨
- `vision/slide_NNN.json`은 두 번 갱신될 수 있음: Phase1(CQI 적용) + 스크립트 편집 페이지(PUT /scripts)

---

## 2. `lecture.json` 스키마

플레이어(웹)가 직접 소비하는 단일 진실 소스. 백엔드 `lecture_builder.py`가 작성.

```json
{
  "lecture_id": "2026-05-21_77c15663",
  "title": "인공지능의 개요",
  "created_at": "2026-05-21T10:00:00+09:00",
  "slide_size": { "w": 1500, "h": 844 },
  "slides": [
    {
      "index": 1,
      "image": "slides/slide_001.png",
      "segments": [
        {
          "id": "seg_1",
          "script": "이 슬라이드는 ...",
          "keyword": "LECTURE 01",
          "highlight": { "x_pct": 5.0, "y_pct": 4.0, "w_pct": 45.0, "h_pct": 8.0 },
          "effect": "highlighter",
          "audio": "audio/slide_001_seg_01.mp3",
          "duration_ms": 13050.0,
          "words": [
            { "text": "이",         "offset_ms": 100.0,  "duration_ms": 146.7 },
            { "text": "슬라이드는", "offset_ms": 246.7,  "duration_ms": 733.7 }
          ]
        }
      ]
    }
  ]
}
```

### 필드 정의

| 필드 | 타입 | 설명 |
|------|------|------|
| `slide_size.w/h` | int | 슬라이드 PNG 실제 픽셀 크기 (150 DPI 변환 기준) — 오버레이 좌표 계산 기준 |
| `slides[].image` | str | `lecture_id` 디렉터리 기준 상대 경로 |
| `segments[].highlight.*_pct` | float | 슬라이드 이미지 전체 크기 대비 백분율 (0~100), Claude Vision 추정값 |
| `segments[].effect` | enum | `"highlighter"` \| `"check"` — Vision 기본값 `"highlighter"`, UI에서 일괄 변경 가능 |
| `segments[].audio` | str | 세그먼트 MP3 상대 경로 |
| `segments[].duration_ms` | float | MP3 재생 시간 (ms) |
| `segments[].words[].offset_ms` | float | 세그먼트 오디오 시작 기준 밀리초 (SentenceBoundary 글자수 비례 분배) |
| `segments[].words[].duration_ms` | float | 해당 어절 발화 시간 (ms) |

### 좌표 활용 방법 (overlay.js)

```
nw, nh = slide_size.w, slide_size.h   ← lecture.json에서 로드
scale  = min(canvas.width / nw, canvas.height / nh)   ← object-fit:contain 역산
rx     = (canvas.width  - nw * scale) / 2
ry     = (canvas.height - nh * scale) / 2
pixel_x = rx + (x_pct / 100) * nw * scale
pixel_y = ry + (y_pct / 100) * nh * scale
```

### 정합성 규칙

- 좌표: `[0, 100]` 범위, `x_pct + w_pct ≤ 100`, `y_pct + h_pct ≤ 100`
- `words[]` 타이밍: 마지막 `offset_ms + duration_ms` ≤ 세그먼트 `duration_ms` (허용 오차 ±200ms)
- 분석 실패 슬라이드: `segments: []` — 플레이어는 오디오 없이 슬라이드만 표시 후 다음으로 진행

---

## 3. 정적 서빙 매핑

| URL 패턴 | 실제 경로 |
|----------|-----------|
| `GET /static/lectures/{id}/slides/slide_NNN.png` | `storage/lectures/{id}/slides/slide_NNN.png` |
| `GET /static/lectures/{id}/audio/slide_NNN_seg_MM.mp3` | `storage/lectures/{id}/audio/slide_NNN_seg_MM.mp3` |

`lecture.json` 내 `image`, `audio` 필드는 `lecture_id` 디렉터리 기준 상대 경로.
플레이어는 `/static/lectures/{id}/`를 base로 결합해 사용:

```js
base = `/static/lectures/${id}`;
slideImg.src = `${base}/${slide.image}`;    // slides/slide_001.png
audio.src    = `${base}/${seg.audio}`;      // audio/slide_001_seg_01.mp3
```

---

## 4. 프로젝트 내보내기 ZIP 형식

`GET /api/lectures/{id}/export`가 생성하는 ZIP. 외부 강의 운영 웹에서 그대로 사용 가능.

```
{title}_{lecture_id}.zip
├── lecture.json              ← 단일 진실 소스 (상대 경로 기반)
├── slides/
│   ├── slide_001.png
│   └── slide_NNN.png
└── audio/
    ├── slide_001_seg_01.mp3
    ├── slide_001_seg_01.words.json
    └── slide_NNN_seg_MM.mp3 (+ .words.json)
```

**외부 플레이어 통합 방법:**
1. ZIP 압축 해제 → 정적 파일 서버(nginx, S3 등)에 폴더 통째로 업로드
2. `lecture.json` 로드 → `slides[].image`, `segments[].audio` 모두 상대 경로이므로 base URL만 지정하면 됨
3. 자막 타이밍(`segments[].words[]`)·강조 좌표(`segments[].highlight`)·강조 효과(`segments[].effect`) 그대로 활용 가능

**생성 조건:** `lecture.json`이 없으면 HTTP 404 (TTS 생성 완료 전 내보내기 불가)

---

## 5. vision/ 캐시 스키마

`vision/slide_NNN.json` — Claude Vision 응답을 저장. 이후 CQI 적용·스크립트 편집 시 갱신.
`lecture_builder.py`가 읽어 `lecture.json`에 통합.

**갱신 타이밍:**
1. Phase1: Vision 분석 직후 최초 생성
2. Phase1(CQI): CQI 텍스트가 있으면 `cqi_adapter` 결과로 덮어쓰기
3. PUT `/api/lectures/{id}/scripts`: 스크립트 편집 페이지 저장 시 덮어쓰기

```json
{
  "slide_index": 1,
  "title": "LECTURE 01 · INTRODUCTION",
  "segments": [
    {
      "id": "seg_1",
      "script": "강의 스크립트...",
      "keyword": "LECTURE 01",
      "highlight": { "x_pct": 5, "y_pct": 4, "w_pct": 45, "h_pct": 8 },
      "effect": "highlighter"
    }
  ]
}
```
