# web/ — 프론트엔드 (정적 HTML/CSS/JS)

> 라이브 DOM 슬라이드 재생 + 텍스트 정밀 강조 + 실시간 자막 + 스크립트·강조 대상 편집.
> 전체 시스템 개요는 루트 [`../CLAUDE.md`](../CLAUDE.md), 백엔드는 [`../app/CLAUDE.md`](../app/CLAUDE.md), 입력 데이터 스키마는 [`../storage/CLAUDE.md`](../storage/CLAUDE.md) 참고.

---

## 1. 디렉터리 구조

```
web/
├── index.html                # 업로드 + CQI 입력 + SSE 진행바 + 강의 목록 라이브러리
├── scripts.html              # 스크립트·강조 영역 편집 + 🏠 홈 버튼 (TTS 후 재편집도 가능)
├── player.html               # 강의 재생 + 🏠 홈 / ✏️ 편집 / ⬇ 내보내기 버튼
├── css/
│   ├── common.css            # CSS 변수, 공통 레이아웃, 사이트 nav, 라이브러리 카드 스타일
│   ├── scripts.css           # 스크립트 편집 전용 스타일 (모달, 미리보기 캔버스, 홈 버튼)
│   └── player.css            # 플레이어 전용 스타일 (홈·내보내기 버튼 포함)
└── js/
    ├── upload.js             # 업로드 폼 + EventSource 진행바 + 강의 목록(loadLibrary)
    ├── scripts.js            # 스크립트 편집 + 모달 드래그 + TTS SSE
    ├── player.js             # 메인 컨트롤러, lectureId 모듈 레벨 선언, 편집·내보내기 링크
    ├── slide-stage.js        # 라이브 DOM 슬라이드 렌더 + data-ref 강조 (형광펜·밑줄·체크)
    │                         #  + figure 다이어그램 viewBox 자동 맞춤(_fitFigures)
    ├── overlay.js            # Canvas 강조 (레거시 PNG 강의 전용)
    └── subtitle.js           # 자막 동기화 모듈
```

---

## 2. 화면 구성

### index.html (업로드 + 강의 목록)

- 사이트 네비게이션 헤더 (로고 + 현재 페이지)
- 파일 선택 + (선택) CQI 피드백 텍스트 입력 → `POST /api/upload` (multipart, `cqi` 필드 포함)
- 수신 즉시 `EventSource('/api/jobs/{id}/events')` 구독
- 이벤트별 처리:
  - `step` / `progress` → 진행바(`progress-fill`) + 라벨 텍스트 업데이트
  - `scripts_ready` → 600ms 후 `/scripts?id=...`로 이동 (**Phase1 종단 이벤트**)
  - `job_error` → 오류 메시지 표시, 버튼 재활성화
  - `onerror` → `terminated` 플래그 확인 후 "서버 연결 끊김" 안내 (종단 이벤트 후 발생하는 race condition 억제)
- **강의 목록 섹션**: 페이지 로드 시 `GET /api/lectures`로 완료 강의 목록 표시
  - 각 카드: 제목, 날짜, 슬라이드/세그먼트 수, CQI 뱃지
  - 버튼: ▶ 재생 (`/player`) | ✏️ 편집 (`/scripts`) | ⬇ 내보내기 (`/api/lectures/{id}/export`)
  - ↻ 새로고침 버튼으로 목록 재로드

### scripts.html (스크립트 편집)

- **접근 시점**: Phase1 완료(`scripts_ready`) 후 자동 이동 **또는** 플레이어/목록의 "✏️ 편집" 링크
- **🏠 홈 버튼**: 상단 바 왼쪽 — `/` (강의 목록)으로 복귀
- 레이아웃: 상단 바(홈 버튼 포함) / 사이드바(슬라이드 썸네일) / 메인(에디터) / 하단 바
- **슬라이드 미리보기**: `aspect-ratio:16/9` Canvas로 모든 세그먼트 강조 영역 색상 표시
- **세그먼트 카드**: 번호 뱃지(색상) + 키워드 입력 + "✎ 영역 지정" 버튼 + 스크립트 텍스트에어리어 + 좌표 정보
- **마우스 드래그 영역 지정**: "✎ 영역 지정" 클릭 시 풀스크린 모달 오픈 → 슬라이드 이미지 위 캔버스에서 드래그로 강조 영역 지정
- **하단 바 버튼 상태**:
  - `has_lecture_json = false`: "▶ TTS 음성 생성 시작" 표시, "🎯 효과만 적용" 숨김
  - `has_lecture_json = true`: "🔄 TTS 재생성" 표시, "🎯 효과만 적용" 표시
- **완료 패널**: TTS/rebuild 완료 시 자동 이동 대신 완료 패널 표시 → "▶ 플레이어로 이동" / "✏️ 계속 편집"

### player.html (재생)

- 상단: 강의 제목 + 슬라이드 번호 카운터
- 중앙: 슬라이드 HTML을 라이브 DOM으로 렌더(`#slide-dom`) — 강조는 `[data-ref]` 요소에 직접 적용
  - 레거시 PNG 강의는 `<img>` + Canvas 오버레이로 자동 분기
- 하단: 자막 바 (2줄 고정 높이 76px, overflow:hidden)
- 컨트롤: 🏠 홈 / ◀◀ 이전 / ▶ 재생·일시정지 / ▶▶ 다음 / 시간 표시 / 강조 효과 선택(형광펜·밑줄·체크) / ✏️ 편집 / ⬇ 내보내기
  - "🏠 홈" → `/` (강의 목록으로)
  - "✏️ 편집" → `/scripts?id={id}` (스크립트 편집 페이지)
  - "⬇ 내보내기" → `/api/lectures/{id}/export` (ZIP 다운로드)
- 스크립트 로드 순서: `subtitle.js` → `slide-stage.js` → `overlay.js` → `player.js` (defer)
- `lectureId` 변수: 모듈 레벨에 선언 (`new URLSearchParams(location.search).get("id")`) — 모든 버튼 href에서 공유

---

## 3. 슬라이드/오디오 진행 모델 (`player.js`)

### 상태 변수

```js
let lecture  = null;   // lecture.json 전체
let base     = "";     // /static/lectures/{id}
let slideIdx = 0;
let segIdx   = 0;
let playing  = false;
let audio    = new Audio();
let _curSeg  = null;   // 현재 세그먼트 (재생 버튼 클릭 시 오버레이 재트리거용)
```

### 상태 변수 (모듈 레벨)

```js
const lectureId = new URLSearchParams(location.search).get("id") || "";
// 모듈 최상단에서 URL 파라미터 추출 — setupControls() 등 모든 함수에서 공유
```

### 초기화 흐름

```
IIFE 실행
  → GET /api/lectures/{id}  → lecture 로드
  → Overlay.setNaturalSize(slide_size.w, slide_size.h)  // 좌표 기준 설정
  → goSlide(0, 0, false)
  → setupControls()
    → slideImg.addEventListener("load", () => Overlay.resize())
    → new ResizeObserver(() => Overlay.resize()).observe(slideImg.parentElement)
    → btn-edit-scripts.href = /scripts?id=${lectureId}
    → btn-export.href        = /api/lectures/${lectureId}/export
```

### 세그먼트 진행

```
goSlide(si, segi, autoPlay)
  → slideImg.src 교체, Overlay.clear()
  → loadSegment(seg, autoPlay)
      → _curSeg = seg
      → Subtitle.load(seg.words)
      → audio.src = ..., audio.load()
      → autoPlay 이면 audio.play() + Overlay.trigger(seg, effectSel.value)

audio.onended → advance()
  → 같은 슬라이드 다음 세그먼트: loadSegment(nextSeg, true)
  → 다음 슬라이드: goSlide(slideIdx+1, 0, true)
  → 마지막 슬라이드 끝: playing=false
```

---

## 4. 스크립트 편집 (`scripts.js`)

### 상태 변수

```js
let slides     = [];   // vision JSON 병합 배열 (live state)
let currentIdx = 0;
let dirty      = false;

// 모달 드래그 상태
let modalCanvas = null;
let modalCtx    = null;
let modalSegIdx = null;   // 현재 편집 중인 세그먼트 인덱스
let isDragging  = false;
let dragStart   = null;   // { px, py }
let dragEnd     = null;
```

### 초기화 흐름

```
loadScripts()
  → GET /api/lectures/{id}/scripts
  → applyLectureJsonState(data.has_lecture_json)  // 버튼 라벨 분기
  → buildThumbs()
  → renderSlide(0)
```

### 강조 영역 모달 (`openDrawModal(si)`)

```
openDrawModal(si)
  → saveCurrentToState()       // 현재 입력값 slides 배열에 반영
  → 모달 표시, 슬라이드 이미지 로드
  → canvas 생성(drawModalWrap에 삽입), 크기 = clientWidth × clientHeight
  → drawModalCanvas()          // 기존 영역 + 드래그 미리보기 렌더
  → 마우스 이벤트 등록

onModalDragEnd()
  → canvasToPct(x, y, w, h, bounds)  // 픽셀 → % 변환, 이미지 경계 클램프
  → slides[currentIdx].segments[modalSegIdx].highlight = pct
  → hl-info 텍스트 업데이트
  → drawPreviewHighlights()    // 인라인 미리보기 캔버스 갱신
  → closeDrawModal()
```

### 좌표 변환

```js
getModalBounds()   // scale = min(cW/natW, cH/natH), imgX = (cW-imgW)/2
canvasToPct(rx, ry, rw, rh, b)  // 이미지 경계 클램프 후 % 변환, 소수점 1자리
```

### 버튼 동작

| 버튼 | 동작 |
|------|------|
| 저장 | `PUT /api/lectures/{id}/scripts` |
| 🎯 효과만 적용 | 저장 → `POST /api/lectures/{id}/rebuild-json` → 완료 패널 |
| ▶ TTS 음성 생성 / 🔄 TTS 재생성 | 저장 → `POST /api/lectures/{id}/synthesize` → SSE 수신 → 완료 패널 |
| ▶ 플레이어로 이동 | `/player?id={id}` |
| ✏️ 계속 편집 | 완료 패널 닫기, 버튼 재활성화 |

### SSE 수신 (`listenTtsSSE`)

- `terminated` 플래그 패턴으로 `done` 후 `onerror` 억제
- `done` 이벤트 수신 시 자동 이동 없이 완료 패널(`showDonePanel`) 표시

---

## 5. Canvas 오버레이 (`overlay.js`)

### 설계 원칙

- **좌표 계산**: `object-fit:contain` 역산으로 이미지 렌더 영역을 직접 계산 (getBoundingClientRect 미사용)
  ```
  scale = min(canvas.width / nw, canvas.height / nh)
  rx    = (canvas.width  - nw * scale) / 2   ← letterbox 좌우 오프셋
  ry    = (canvas.height - nh * scale) / 2   ← letterbox 상하 오프셋
  pixel_x = rx + (x_pct / 100) * nw * scale
  ```
- **자연 크기 기준**: `Overlay.setNaturalSize(w, h)`로 lecture.json의 `slide_size`를 먼저 등록
- **세그먼트 전환 시 이전 효과 삭제**: `trigger()` 호출 시 `_drawn` 초기화

### Public API

```js
Overlay.init(imgEl, canvasEl)          // player.js 모듈 레벨에서 1회 호출
Overlay.setNaturalSize(w, h)           // lecture.json slide_size 등록
Overlay.trigger(seg, effectType)       // 새 세그먼트 효과 시작 (이전 효과 자동 삭제)
Overlay.clear()                        // 슬라이드 전환 시 전체 초기화
Overlay.resize()                       // ResizeObserver / 이미지 onload 콜백
```

### 강조 효과 사양

| 효과 | 색상 | 형태 | 애니메이션 |
|------|------|------|-----------|
| `highlighter` | `rgba(255,235,59,0.45)` | 직사각형 채움 | 좌→우 350ms ease-out cubic |
| `check` | `#16a34a` (초록 원 배경 + 흰 ✓) | 박스 내부 우측 상단 | 0→1 path 진행 400ms |
| `none` | — | — | 효과 없음 |

---

## 6. 자막 동기화 (`subtitle.js`)

### 높이 고정 (player.css)

```css
.subtitle-bar {
  height: 76px;           /* 2줄 고정: font 17px × 1.5 × 2줄 + gap 4px + padding 20px */
  overflow: hidden;
  align-content: center;  /* 1줄일 때 세로 중앙 정렬 */
}
```

### 동작

- `Subtitle.load(words)`: 세그먼트의 `words[]`로 span 목록 생성
- `Subtitle.update(currentMs)`: `currentMs ≥ word.offset_ms`인 마지막 어절을 `.current`로 표시
- 이전 어절: `.past` (밝은 색), 현재 어절: `.current` (노란색 bold), 이후 어절: `.word` (흐린 색)
- `scrollIntoView` 미사용 (overflow:hidden 환경에서 페이지 스크롤 유발 방지)

---

