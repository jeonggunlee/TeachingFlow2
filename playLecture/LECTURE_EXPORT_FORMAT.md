# 강의 Export 패키지 — 운영 사이트 연동 가이드

> HALLYM EDUTECH 시스템이 생성한 ZIP 파일을 이용해 독립적인 강의 운영 사이트를 구축하기 위한 명세서.
> 이 문서만 읽으면 ZIP을 입력받아 완전한 강의 플레이어를 구현할 수 있다.

---

## 1. ZIP 패키지 구조

`GET /api/lectures/{id}/export`로 다운로드한 ZIP 파일의 내부 레이아웃:

```
{강의제목}_{lecture_id}.zip
├── lecture.json                        ← 단일 진실 소스 (모든 메타·좌표·타이밍)
├── slides/
│   ├── slide_001.png                   ← 슬라이드 이미지 (150 DPI PNG, 1500×844 px)
│   ├── slide_002.png
│   └── slide_NNN.png
└── audio/
    ├── slide_001_seg_01.mp3            ← 세그먼트 음성 파일
    ├── slide_001_seg_01.words.json     ← 어절별 타이밍 (자막 동기화용)
    ├── slide_001_seg_02.mp3
    ├── slide_001_seg_02.words.json
    └── slide_NNN_seg_MM.mp3 (+ .words.json)
```

**파일 규모 예시** (슬라이드 10장, 세그먼트 42개):
| 파일 종류 | 개수 | 총 용량 |
|-----------|------|---------|
| lecture.json | 1 | ~170 KB |
| slide_NNN.png | 슬라이드 수 | 장당 70~130 KB |
| slide_NNN_seg_MM.mp3 | 세그먼트 수 | 세그먼트당 70~170 KB |
| slide_NNN_seg_MM.words.json | 세그먼트 수 | 세그먼트당 1~3 KB |

---

## 2. `lecture.json` 스키마

강의 플레이어가 소비하는 **단일 진실 소스**. 이 파일 하나로 전체 강의를 재현할 수 있다.

### 2-1. 최상위 구조

```json
{
  "lecture_id": "2026-05-21_2c460bf9",
  "title": "인공지능의 개요",
  "created_at": "2026-05-21T08:28:39.200506+00:00",
  "slide_size": {
    "w": 1500,
    "h": 844
  },
  "slides": [ /* 슬라이드 배열 — 아래 참조 */ ]
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `lecture_id` | string | `YYYY-MM-DD_<uuid8>` 형식의 고유 ID |
| `title` | string | 강의 제목 (PPT 첫 슬라이드에서 추출) |
| `created_at` | ISO 8601 | 생성 시각 (UTC+0, 로컬 표시 시 변환 필요) |
| `slide_size.w` | int | 슬라이드 PNG 가로 픽셀 (항상 **1500**) |
| `slide_size.h` | int | 슬라이드 PNG 세로 픽셀 (항상 **844**, 16:9) |

### 2-2. 슬라이드 (`slides[]`)

```json
{
  "index": 1,
  "image": "slides/slide_001.png",
  "segments": [ /* 세그먼트 배열 — 아래 참조 */ ]
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `index` | int | 슬라이드 번호 (1부터 시작) |
| `image` | string | ZIP 루트 기준 상대 경로 |
| `segments` | array | 이 슬라이드의 강의 구간 목록. 빈 배열(`[]`)이면 오디오 없이 슬라이드만 표시 |

### 2-3. 세그먼트 (`segments[]`) — 핵심 단위

```json
{
  "id": "seg_1",
  "script": "이 슬라이드는 Lecture 01, Introduction으로 강의의 첫 번째 시간임을 나타냅니다.",
  "keyword": "LECTURE 01",
  "highlight": {
    "x_pct": 5.0,
    "y_pct": 4.0,
    "w_pct": 40.0,
    "h_pct": 8.0
  },
  "effect": "highlighter",
  "audio": "audio/slide_001_seg_01.mp3",
  "duration_ms": 12112.5,
  "words": [
    { "text": "이",       "offset_ms": 100.0,  "duration_ms": 152.4 },
    { "text": "슬라이드는", "offset_ms": 252.4,  "duration_ms": 762.2 },
    { "text": "Lecture",  "offset_ms": 1014.7, "duration_ms": 1067.1 }
  ]
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | string | 슬라이드 내 고유 식별자 (`seg_1`, `seg_2`, …) |
| `script` | string | 이 세그먼트의 전체 강의 스크립트 |
| `keyword` | string | 강조 영역 라벨 (UI 표시용, 예: "LECTURE 01") |
| `highlight.x_pct` | float | 강조 박스 좌상단 X 좌표 (슬라이드 전체 너비 대비 %, 0~100) |
| `highlight.y_pct` | float | 강조 박스 좌상단 Y 좌표 (슬라이드 전체 높이 대비 %, 0~100) |
| `highlight.w_pct` | float | 강조 박스 너비 (%) |
| `highlight.h_pct` | float | 강조 박스 높이 (%) |
| `effect` | enum | 강조 효과 종류 (아래 참조) |
| `audio` | string | ZIP 루트 기준 MP3 상대 경로 |
| `duration_ms` | float | MP3 총 재생 시간 (밀리초) |
| `words` | array | 어절별 자막 타이밍 (아래 참조) |

#### `effect` 열거값

| 값 | 효과 | 렌더링 |
|----|------|--------|
| `"highlighter"` | 노란 형광펜 | 반투명 노란 직사각형 (`rgba(255,235,59,0.45)`), 좌→우 350ms 애니메이션 |
| `"check"` | 초록 체크 심볼 | 초록 원 배경(`#16a34a`) + 흰 ✓, 400ms path 드로잉 애니메이션 |
| `"none"` | 효과 없음 | 강조 표시 생략 |

### 2-4. 어절 타이밍 (`words[]`)

```json
{ "text": "이",       "offset_ms": 100.0,  "duration_ms": 152.4 }
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `text` | string | 어절 텍스트 |
| `offset_ms` | float | **세그먼트 오디오 시작점** 기준 경과 시간 (ms). 전체 타임라인 기준 아님 |
| `duration_ms` | float | 해당 어절 발화 지속 시간 (ms) |

> **주의:** `offset_ms`는 세그먼트 MP3 내 상대 시각이다. 전체 강의 절대 시각이 필요하면 각 세그먼트 재생 시작 시각을 누적해서 더해야 한다.

---

## 3. `words.json` 파일 (선택적 사용)

`audio/slide_NNN_seg_MM.words.json` — `lecture.json`의 `words[]` 와 **동일한 데이터**를 별도 파일로도 제공.

```json
[
  { "text": "이",       "offset_ms": 100.0,  "duration_ms": 152.4 },
  { "text": "슬라이드는", "offset_ms": 252.4,  "duration_ms": 762.2 },
  { "text": "Lecture",  "offset_ms": 1014.7, "duration_ms": 1067.1 }
]
```

`lecture.json`의 `words[]`를 사용하면 이 파일은 읽지 않아도 된다. 두 파일의 내용은 항상 일치한다.

---

## 4. 강의 진행 시퀀스

플레이어가 구현해야 할 **표준 재생 흐름**:

```
1. lecture.json 로드
2. slides[0] 표시
   a. slides[0].image → 슬라이드 PNG 표시
   b. segments[0] 처리:
      - audio → MP3 로드 & 재생
      - highlight + effect → Canvas 강조 효과 표시
      - words[] + audio.currentTime → 실시간 자막 동기화
   c. MP3 종료 → segments[1] 처리 (b 반복)
   d. 마지막 세그먼트 종료 → slides[1]로 이동 (2 반복)
3. 마지막 슬라이드·세그먼트 종료 → 강의 완료
```

**엣지 케이스:**
- `segments[]`가 빈 배열인 슬라이드 → 오디오 없이 N초(구현 선택) 표시 후 다음 슬라이드
- 네트워크 오류로 MP3 로드 실패 → 해당 세그먼트 스킵하고 다음 진행 (또는 재시도)

---

## 5. 강조 효과 좌표 계산

슬라이드 이미지는 `object-fit: contain` 방식으로 화면에 맞게 렌더링된다.
**퍼센트 좌표 → 실제 화면 픽셀** 변환 공식:

```js
// lecture.json에서 로드
const natW = lecture.slide_size.w;  // 1500
const natH = lecture.slide_size.h;  // 844

// 렌더링된 슬라이드 컨테이너 크기 (ResizeObserver로 갱신)
const cW = container.clientWidth;
const cH = container.clientHeight;

// object-fit:contain 역산
const scale = Math.min(cW / natW, cH / natH);
const imgW  = natW * scale;
const imgH  = natH * scale;
const rx    = (cW - imgW) / 2;   // 좌우 레터박스 오프셋
const ry    = (cH - imgH) / 2;   // 상하 레터박스 오프셋

// 퍼센트 → 화면 픽셀
function pctToPixel(xPct, yPct, wPct, hPct) {
  return {
    x: rx + (xPct / 100) * imgW,
    y: ry + (yPct / 100) * imgH,
    w: (wPct / 100) * imgW,
    h: (hPct / 100) * imgH,
  };
}
```

> Canvas는 슬라이드 이미지와 동일한 크기·위치에 `position: absolute; inset: 0`으로 겹쳐 놓는다.

---

## 6. 실시간 자막 동기화

```js
// 세그먼트 시작 시 words[] 설정
let words = segment.words;

// audio.timeupdate 이벤트마다 호출
function updateSubtitle(currentMs) {
  // offset_ms는 세그먼트 오디오 기준 상대 시각
  const activeIdx = words.reduce((last, w, i) =>
    currentMs >= w.offset_ms ? i : last, -1);

  words.forEach((w, i) => {
    span[i].className =
      i < activeIdx  ? "word past"    :   // 이미 발화된 어절
      i === activeIdx ? "word current" :   // 현재 발화 중 어절
                        "word future";     // 아직 발화 안 된 어절
  });
}

audio.addEventListener("timeupdate", () => {
  updateSubtitle(audio.currentTime * 1000);  // 초 → 밀리초
});
```

**자막 UI 권장 스타일:**
- `past`: 밝은 회색 (이미 지나간 텍스트)
- `current`: 노란색 + bold (현재 발화 중)
- `future`: 어두운 회색 (아직 발화 안 됨)
- 2줄 고정 높이 + `overflow: hidden` (페이지 스크롤 방지)

---

## 7. 운영 사이트 구현 가이드

### 7-1. 정적 파일 서버 방식 (권장)

```
1. ZIP 압축 해제 → 결과 폴더 통째로 정적 서버 업로드
2. lecture.json 경로를 base URL로 설정
3. image, audio 필드의 상대 경로를 base URL과 합쳐서 사용
```

```js
// base = ZIP 해제 폴더가 위치한 URL
const base = "https://cdn.example.com/lectures/2026-05-21_2c460bf9";

// 슬라이드 이미지
slideImg.src = `${base}/${slide.image}`;       // slides/slide_001.png

// 세그먼트 오디오
audio.src = `${base}/${segment.audio}`;        // audio/slide_001_seg_01.mp3
```

**지원 정적 서버:** nginx, Apache, AWS S3 + CloudFront, GitHub Pages, Netlify, Vercel 등 어디서나 가능.

### 7-2. 백엔드 업로드 방식

ZIP 파일을 서버가 받아서 DB + 파일 스토리지로 분산 저장하는 경우:

```
1. ZIP 업로드 → 서버에서 압축 해제
2. lecture.json 파싱 → DB에 메타 저장
   - lecture_id, title, created_at, slide_size
   - slides 배열: slide.index, slide.image 경로
   - segments 배열: id, script, keyword, highlight, effect, audio, duration_ms
   - words 배열: text, offset_ms, duration_ms
3. PNG, MP3 파일 → 스토리지(S3 등)에 업로드 후 URL로 교체
4. 플레이어는 DB에서 lecture.json 구조에 해당하는 API를 호출
```

### 7-3. 필수 구현 기능 체크리스트

| 기능 | 필수 | 데이터 소스 |
|------|------|------------|
| 슬라이드 이미지 표시 | ✅ | `slides[].image` |
| 세그먼트 MP3 순차 재생 | ✅ | `segments[].audio` |
| 슬라이드 자동 진행 | ✅ | MP3 `ended` 이벤트 |
| Canvas 강조 효과 | ✅ | `segments[].highlight` + `effect` |
| 실시간 자막 | 권장 | `segments[].words[]` |
| 이전/다음 슬라이드 수동 이동 | 권장 | — |
| 재생/일시정지 | 권장 | — |
| 강의 제목·슬라이드 번호 표시 | 권장 | `title`, `slides[].index` |
| 세그먼트 스크립트 표시 | 선택 | `segments[].script` |
| 영상 녹화 | 선택 | MediaRecorder API |

---

## 8. 정합성 규칙 및 예외 처리

### 좌표 유효 범위

```
0 ≤ x_pct ≤ 100,  x_pct + w_pct ≤ 100
0 ≤ y_pct ≤ 100,  y_pct + h_pct ≤ 100
```

### 어절 타이밍 유효 범위

```
마지막 어절의 (offset_ms + duration_ms) ≤ segment.duration_ms + 200ms (허용 오차)
```

### 빈 세그먼트 슬라이드

```js
if (slide.segments.length === 0) {
  // 오디오 없이 슬라이드만 표시
  // 일정 시간(예: 3초) 후 자동으로 다음 슬라이드로 이동하거나
  // 사용자가 수동으로 넘기도록 처리
}
```

---

## 9. 실제 데이터 예시 (슬라이드 1, 세그먼트 1 전체)

```json
{
  "lecture_id": "2026-05-21_2c460bf9",
  "title": "인공지능의 개요",
  "created_at": "2026-05-21T08:28:39.200506+00:00",
  "slide_size": { "w": 1500, "h": 844 },
  "slides": [
    {
      "index": 1,
      "image": "slides/slide_001.png",
      "segments": [
        {
          "id": "seg_1",
          "script": "이 슬라이드는 Lecture 01, Introduction으로 강의의 첫 번째 시간임을 나타냅니다. 오늘은 인공지능의 전반적인 개요를 다루는 첫 강의입니다.",
          "keyword": "LECTURE 01",
          "highlight": { "x_pct": 5.0, "y_pct": 4.0, "w_pct": 40.0, "h_pct": 8.0 },
          "effect": "highlighter",
          "audio": "audio/slide_001_seg_01.mp3",
          "duration_ms": 12112.5,
          "words": [
            { "text": "이",        "offset_ms": 100.0,  "duration_ms": 152.4  },
            { "text": "슬라이드는", "offset_ms": 252.4,  "duration_ms": 762.2  },
            { "text": "Lecture",   "offset_ms": 1014.7, "duration_ms": 1067.1 },
            { "text": "01,",       "offset_ms": 2081.8, "duration_ms": 609.5  },
            { "text": "Introduction으로", "offset_ms": 2691.3, "duration_ms": 1524.8 }
          ]
        }
      ]
    }
  ]
}
```

---

## 10. 참고: 현재 EDUTECH 시스템의 플레이어 구현

기존 `EDUTECH-3/web/` 디렉터리에 있는 파일들이 이 포맷을 소비하는 레퍼런스 구현이다.

| 파일 | 역할 |
|------|------|
| `web/player.html` | 플레이어 HTML 골격 |
| `web/js/player.js` | 슬라이드/세그먼트 진행 컨트롤러 |
| `web/js/overlay.js` | Canvas 강조 효과 (highlighter/check) |
| `web/js/subtitle.js` | 어절 타이밍 자막 동기화 |
| `web/js/recorder.js` | MediaRecorder 기반 WebM 녹화 |

새 운영 사이트 구현 시 이 파일들을 참고하거나 그대로 재사용할 수 있다.
