# app/ — 백엔드 (FastAPI)

> 프롬프트 → 웹 슬라이드 렌더 → Claude Vision 분석 → (CQI 적용) → 스크립트 편집 대기 → Edge TTS 합성 → `lecture.json` 빌드 + SSE 진행 스트림.
> 전체 시스템 개요는 루트 [`../CLAUDE.md`](../CLAUDE.md), 산출물 스키마는 [`../storage/CLAUDE.md`](../storage/CLAUDE.md), 프론트엔드는 [`../web/CLAUDE.md`](../web/CLAUDE.md) 참고.

---

## 1. 디렉터리 구조

```
app/
├── main.py                   # FastAPI 진입점, 라우터 등록, 정적 마운트
├── config.py                 # 환경 설정 (Pydantic Settings)
├── api/
│   ├── upload.py             # POST /api/upload-prompt + 파이프라인 (BackgroundTask)
│   ├── jobs.py               # GET /api/jobs/{id}/events  (SSE 스트리밍)
│   ├── lectures.py           # GET /api/lectures (목록), /{id} (상세), /{id}/export (ZIP)
│   └── scripts.py            # GET/PUT /scripts, POST /synthesize, POST /rebuild-json
├── services/
│   ├── slide_renderer.py     # 프롬프트 → 아웃라인 → HTML 프래그먼트 (+ data-ref)
│   ├── slide_diagrams.py     # SVG 다이어그램 (venn·flow·layers·cycle·figure)
│   ├── segment_writer.py     # 아웃라인 → 요소 id 기반 내레이션 (좌표 추측 없음)
│   ├── cqi_adapter.py        # Claude API 기반 CQI 스크립트 개선
│   ├── tts_text.py           # 수식·기호 → 낭독형 (display/spoken 분리)
│   ├── tts_synthesizer.py    # Edge TTS + SentenceBoundary 어절 분배
│   └── lecture_builder.py    # lecture.json 조립
└── utils/
    ├── storage.py            # 강의 디렉터리/경로 관리
    └── sse.py                # asyncio.Queue 기반 SSE 이벤트 관리
```

> `models/schemas.py`는 현재 미사용 — FastAPI dict 반환으로 처리 중.

---

## 2. 의존성

`requirements.txt`:

```
fastapi
uvicorn[standard]
python-multipart
pydantic>=2
pydantic-settings
anthropic>=0.40         # cache_control(prompt caching) 지원
edge-tts                # 7.x — 한국어 WordBoundary 미제공, SentenceBoundary 사용
Pillow
python-dotenv
playwright              # 웹 슬라이드 렌더 (Chromium)
```

시스템 패키지: `fonts-noto-cjk` (+ `python -m playwright install chromium`).

---

## 3. 환경 변수 (.env)

```
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-sonnet-4-6
TTS_VOICE=ko-KR-InJoonNeural
STORAGE_ROOT=./storage
MAX_UPLOAD_MB=80
```

---

## 4. API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `POST` | `/api/upload-prompt` | 프롬프트로 웹 슬라이드 생성, `lecture_id` 반환, Phase1 백그라운드 시작 |
| `GET` | `/api/jobs/{lecture_id}/events` | SSE: `step` / `progress` / `scripts_ready` / `done` / `job_error` 스트림 |
| `GET` | `/api/lectures` | 완료된 강의 목록 반환 (lecture.json 보유, 최신순) |
| `GET` | `/api/lectures/{lecture_id}` | `lecture.json` 반환 (플레이어용) |
| `GET` | `/api/lectures/{lecture_id}/export` | 강의 프로젝트 ZIP 다운로드 (lecture.json + slides/ + audio/) |
| `GET` | `/api/lectures/{lecture_id}/status` | 처리 상태 polling (디버그용) |
| `GET` | `/api/lectures/{lecture_id}/scripts` | vision JSON 전체 + `cqi` + `has_lecture_json` 반환 |
| `PUT` | `/api/lectures/{lecture_id}/scripts` | 편집된 slides 배열을 vision JSON 파일에 저장 |
| `POST` | `/api/lectures/{lecture_id}/synthesize` | Phase2(TTS+빌드) 백그라운드 시작, SSE 큐 재초기화 |
| `POST` | `/api/lectures/{lecture_id}/rebuild-json` | TTS 없이 lecture.json만 재빌드 (강조 위치 변경 시) |
| `GET` | `/static/lectures/{id}/slides/...` | 슬라이드 HTML·CSS 정적 서빙 |
| `GET` | `/static/lectures/{id}/audio/...` | 오디오 MP3 정적 서빙 |
| `GET` | `/` | `web/index.html` 반환 |
| `GET` | `/player` | `web/player.html` 반환 |
| `GET` | `/scripts` | `web/scripts.html` 반환 |

---

## 5. 처리 파이프라인 (2-Phase 구조)

### Phase 1 (`upload.py` → `_run_pipeline_phase1`)

`POST /api/upload-prompt` 응답 반환 직전 `sse.init(lecture_id)`, 이후 BackgroundTask로 실행.

```
단계              진행률     SSE 이벤트
─────────────────────────────────────────────────────────────────
① 슬라이드 렌더   0~22 %   step "프롬프트로 슬라이드 디자인 중..." + 슬라이드마다 progress
② Vision 분석    22~68 %   step + 슬라이드마다 progress
③ CQI 적용       68~80 %   step "CQI 피드백 반영 중..." (cqi 텍스트 있을 때만)
④ scripts_ready  85 %      scripts_ready { lecture_id }  ← 종단 이벤트, 큐 삭제
오류 발생 시                job_error { message }
```

- CQI 텍스트가 있으면 `cqi.txt`로 저장 후 `cqi_adapter.apply()` 호출 → vision JSON 덮어쓰기
- `scripts_ready` 수신 후 브라우저는 `/scripts?id=...` 페이지로 이동

### Phase 2 (`scripts.py` → `_run_pipeline_phase2`)

`POST /api/lectures/{id}/synthesize` 수신 시 `sse.init(lecture_id)` 재초기화 후 BackgroundTask 실행.

```
단계              진행률     SSE 이벤트
─────────────────────────────────────────────────────────────────
① TTS 합성         5~85 %  step + 세그먼트마다 progress
② lecture.json    85~95 %  step "강의 메타데이터 빌드 중..."
③ 완료             100 %   done { lecture_id }  ← 종단 이벤트, 큐 삭제
오류 발생 시                job_error { message }
```

- `synthesize_all(..., force=True)` — 기존 MP3 있어도 항상 재생성 (스크립트 변경 반영)
- 각 단계 예외 → `job.err` 기록 + `job_error` SSE → 후속 단계 중단

---

## 6. 웹 슬라이드 렌더 (`slide_renderer.py`)

```python
async def generate(prompt, lecture_dir, *, num_slides=None, brand=None,
                   on_progress=None, design=None) -> list[Path]
async def render_outline(outline, lecture_dir, *, design=None, ...) -> list[Path]
```

- `_outline()`: Claude가 프롬프트 → 슬라이드 아웃라인 JSON 설계 (디자인 규칙 주입)
- `_css(design)`: `design.json` 스펙으로 CSS 생성 → 버전이 바뀌어도 시각 디자인 유지
- `_render_fragment()`: 각 텍스트 요소에 `data-ref`를 붙인 HTML 프래그먼트 생성
- 산출물: `slides/slide_NNN.html` + `slides/slide.css` + `prompt.txt` + `outline.json` + `design.json`
- **래스터 이미지를 만들지 않는다** — 플레이어가 라이브 DOM으로 렌더
- `render_outline()`은 Claude 호출 없이 확정된 아웃라인만 렌더 — CQI 진화에서 사용

지원 레이아웃 12종:

| 종류 | 레이아웃 |
|------|----------|
| 텍스트 | `title`, `section`, `bullets`, `two_col`, `quote`, `stat`, `closing` |
| 다이어그램(SVG) | `venn`(포함·교집합), `flow`(순서), `layers`(계층), `cycle`(순환), `figure`(자유 개념도) |

### 다이어그램 (`slide_diagrams.py`)

글머리표로는 전달되지 않는 관계를 SVG로 그린다. 도형마다 `data-ref`가 붙어
**내레이션이 그림의 특정 부분만 강조**할 수 있다 (예: 신경망에서 은닉층만).

- 색·선은 CSS 클래스(`dg-*`)로 지정 → `design.json` 토큰을 따르므로 진화해도 디자인 유지
- 작도 규칙은 `design_spec.DIAGRAM_RULES` **한 곳**에 있고 `rules_prompt()`가 주입한다.
  최초 생성(`slide_renderer._outline`)과 CQI 진화(`cqi_evolver.evolve_outline`) 모두
  같은 함수를 쓰므로 **어느 경로로 만들어도 같은 규칙이 적용된다**
- **그림은 크게 그린다.** `.dg-wrap`은 `flex-direction: column` — figure 레이아웃만
  그림과 캡션 두 요소를 담기 때문에, row로 두면 둘이 나란히 놓여 그림이
  절반 이하(측정값 19~23%)로 줄어든다
- 모델이 캔버스 한쪽에만 작게 그려 보내면 `slide-stage.js`의 `_fitFigures()`가
  **재생 시점에 viewBox를 그림 크기에 맞춰 좁힌다** (배경 사각형은 제외).
  좁힌 SVG는 `overflow: hidden` — 그러지 않으면 확대된 배경이 제목을 덮는다
- `figure`는 모델이 직접 그린 SVG를 받는다. `sanitize_svg()`가 `<script>`·
  `<foreignObject>`·`<image>`·`on*` 핸들러·외부 `href`를 제거하고, 허용 태그
  목록에 없는 태그가 있으면 통째로 거부한다

## 6-1. 강조 좌표를 없앤 이유

이전에는 슬라이드를 PNG로 만든 뒤 Vision이 `x_pct/y_pct/w_pct/h_pct`를 **추측**했고,
그 결과 형광펜이 문장에서 벗어났다. 지금은 슬라이드를 우리가 만들므로
각 요소에 `data-ref`를 부여하고, 세그먼트가 그 id를 가리킨다.
플레이어는 `[data-ref="b2"]`에 클래스를 붙이기만 하므로 **좌표가 존재하지 않고**,
폰트·줄바꿈이 달라져도 강조는 항상 글자에 정확히 붙는다.

| ref | 대상 |
|-----|------|
| `t` / `st` / `no` | 제목 / 부제 / 섹션 번호 |
| `b1`, `b2`, … | bullets 항목 |
| `lh`,`l1`.. / `rh`,`r1`.. | two_col 좌/우 |
| `q` / `attr` | 인용문 / 출처 |
| `val` / `lbl` / `cap` | stat 수치 / 라벨 / 설명 |

## 7. 내레이션 작성 (`segment_writer.py`)

### 함수 시그니처

```python
async def analyze_all(
    slides: list[Path],
    lecture_dir: Path,
    *,
    concurrency: int = 4,
    force: bool = False,
    on_progress=None,   # async (slide_idx: int) → None
) -> list[dict]:
```

- `asyncio.Semaphore(concurrency)`로 동시 API 호출 수 제한
- 슬라이드 1장 완료마다 `on_progress(idx)` 호출 → SSE progress 이벤트 발행
- 결과는 `vision/slide_NNN.json`에 캐시 (force=False이면 재사용)
- JSON 파싱 실패 시 1회 재시도 → 최종 실패 시 `segments: []`로 fallback

### 응답 스키마 (슬라이드 1장)

```json
{
  "slide_index": 1,
  "title": "슬라이드 제목",
  "segments": [
    {
      "id": "seg_1",
      "script": "강의 스크립트 (2~4문장)",
      "keyword": "핵심 키워드",
      "highlight": { "x_pct": 5.0, "y_pct": 4.0, "w_pct": 45.0, "h_pct": 8.0 },
      "effect": "highlighter"
    }
  ]
}
```

- 좌표는 슬라이드 이미지 전체 크기 대비 백분율 (0~100)
- system 프롬프트에 `cache_control: {"type": "ephemeral"}` 적용으로 비용 절감

---

## 8. CQI 스크립트 개선 (`cqi_adapter.py`)

```python
async def apply(slides: list[dict], cqi_text: str) -> list[dict]:
```

- Claude API 호출로 `slides` JSON 배열 전체를 입력, CQI 피드백 반영 버전 반환
- system 프롬프트 지시: JSON 구조·highlight 좌표 보존, `script`/`keyword` 텍스트만 수정, 세그먼트 추가·삭제 허용
- 응답 파싱 실패 시 정규식으로 `[...]` 배열 추출 재시도
- 성공 시 `vision/slide_NNN.json` 파일 덮어쓰기 → 이후 스크립트 편집 페이지에 반영

---

## 9. Edge TTS 합성 (`tts_synthesizer.py`)

### 함수 시그니처

```python
async def synthesize_all(
    vision_results: list[dict],
    lecture_dir: Path,
    *,
    force: bool = False,
    on_progress=None,   # async () → None — 세그먼트 완료마다 호출
) -> list[dict]:
```

- 세그먼트별 `slide_NNN_seg_MM.mp3` 생성
- `force=True` 시 기존 MP3가 있어도 덮어쓰기 (scripts.py Phase2에서 항상 force=True 사용)
- `_distribute_words(sentences)`: SentenceBoundary 이벤트를 어절 단위로 글자수 비례 분배
  - Edge TTS 7.x 한국어는 WordBoundary 미제공 → SentenceBoundary 기반 분배
- 타이밍 결과는 `slide_NNN_seg_MM.words.json`에 캐시
- 세그먼트 완료마다 `on_progress()` 호출 → SSE progress 이벤트 발행

### 수식 낭독 (`tts_text.py`)

edge-tts 한국어 음성은 **아래첨자·위첨자·`=`·`→`·`…`를 소리 없이 통째로 건너뛴다**(실측 확인).
`h₂ = f(W₂h₁ + b₂)`의 발음 길이가 `h = f(Wh + b)`와 같아, 첨자와 등호가 사라진 채 읽혔다.
괄호는 반대로 "괄호 열고 … 괄호 닫고"로 낭독해 `역전파(Backpropagation)`가 장황해졌다.

그래서 **화면 문장(display)과 낭독 문장(spoken)을 분리**한다.

```
display  두 번째 은닉층은 h₂ = f(W₂h₁ + b₂)입니다.
spoken   두 번째 은닉층은 h2 이퀄 f W2 h1 더하기 b2 입니다.
```

- `prepare(text) → (display 어절, 어절별 spoken 어절, spoken 문장)`
- TTS에는 spoken을 보내고, `_regroup()`이 타이밍을 display 어절 단위로 되접는다
  → **자막에는 원본 첨자가 그대로 보인다**
- 어절 수가 어긋나면 `_spread()`가 발음 글자 수 비례로 분배 (자막 밀림 방지)
- 낭독 방식은 `tts_text._SYMBOLS` 표 한 곳에서 바꾼다
- **모든 합성 경로가 이 변환을 거친다** — `_synthesize()`가 유일한 edge-tts 호출 지점이다.
  또 `_cached_words()`가 캐시된 자막 어절을 현재 스크립트와 대조해, 스크립트를 고쳤거나
  낭독 규칙이 바뀌면 `force=False`여도 캐시를 버리고 다시 합성한다

### words 배열 구조

```python
[
  {"text": "이", "offset_ms": 100.0, "duration_ms": 146.7},
  {"text": "슬라이드는", "offset_ms": 246.7, "duration_ms": 733.7},
  ...
]
```

---

## 10. 강의 목록·내보내기 API (`lectures.py`)

### GET `/api/lectures`

`storage/lectures/` 아래에서 `lecture.json`이 있는 디렉터리만 최신순으로 반환.

```json
[
  {
    "lecture_id": "2026-05-22_a1b2c3d4",
    "title": "인공지능의 개요",
    "created_at": "2026-05-22T10:00:00+09:00",
    "slide_count": 10,
    "segment_count": 28,
    "has_cqi": true
  }
]
```

### GET `/api/lectures/{id}`

`lecture.json` 전체를 그대로 반환 (플레이어용).

### GET `/api/lectures/{id}/export`

강의 프로젝트 전체를 메모리 내 ZIP으로 패키징 후 `StreamingResponse`로 스트리밍.

```
{title}_{lecture_id}.zip
├── lecture.json          ← 상대 경로(slides/, audio/) 기반 — 어디서든 정적 서빙 가능
├── slides/
│   ├── slide_001.html
│   ├── slide_NNN.html
│   └── slide.css
└── audio/
    ├── slide_001_seg_01.mp3
    ├── slide_001_seg_01.words.json
    └── slide_NNN_seg_MM.mp3 (+ .words.json)
```

- `zipfile.ZipFile(buf, "w", ZIP_DEFLATED)` — 표준 라이브러리만 사용 (추가 의존성 없음)
- `lecture.json`은 상대 경로를 사용하므로 ZIP 압축 해제 후 정적 서버에 올리면 외부 플레이어에서 그대로 재생 가능
- `lecture.json` 미존재 시 HTTP 404 반환 (TTS 생성 미완료 강의는 내보내기 불가)

---

## 11. 스크립트 편집 API (`scripts.py`)

### GET `/api/lectures/{id}/scripts`

vision JSON 전체를 슬라이드 배열로 합쳐 반환.

```json
{
  "lecture_id": "...",
  "cqi": "이전 강의 피드백 텍스트 (없으면 빈 문자열)",
  "has_lecture_json": true,
  "slides": [ { "index": 1, "image": "slides/...", "title": "...", "segments": [...] } ]
}
```

- `has_lecture_json`: TTS 완료 여부 → 프론트가 버튼 라벨 분기("TTS 생성" vs "TTS 재생성")

### PUT `/api/lectures/{id}/scripts`

편집된 slides 배열을 받아 `vision/slide_NNN.json` 파일에 저장.

### POST `/api/lectures/{id}/synthesize`

`sse.init(lecture_id)` 재초기화 후 `_run_pipeline_phase2`를 BackgroundTask로 실행.

### POST `/api/lectures/{id}/rebuild-json`

TTS 없이 기존 `vision/` + `audio/` 파일만 읽어 `lecture.json` 재빌드.
강조 영역 위치만 바꿨을 때 사용 — 음성 재합성 없이 빠른 반영.

---

## 12. SSE 이벤트 관리 (`utils/sse.py`)

```python
def init(lecture_id: str) -> None:
    """업로드/synthesize 핸들러가 응답 직전에 호출 — 큐를 미리 생성해 이벤트 손실 방지."""

async def push(lid: str, event: str, **data) -> None:
    """파이프라인에서 이벤트 발행. 첫 인수를 lid로 명명해 lecture_id= 키워드 충돌 방지."""

async def stream(lecture_id: str) -> AsyncGenerator[str, None]:
    """StreamingResponse에 넘길 SSE 제너레이터. 25s 무응답 시 heartbeat 발송."""
```

**이벤트 타입:**

| 이벤트 | data 필드 | 종단 여부 | 설명 |
|--------|-----------|-----------|------|
| `step` | `label`, `progress` | — | 새 단계 시작 |
| `progress` | `label`, `progress` | — | 단계 내 세부 진행 |
| `scripts_ready` | `lecture_id`, `progress` | ✅ 큐 삭제 | Phase1 완료, 스크립트 편집 가능 |
| `done` | `lecture_id`, `progress: 100` | ✅ 큐 삭제 | Phase2 완료 |
| `job_error` | `message` | ✅ 큐 삭제 | 오류 발생 |

- 종단 이벤트 수신 후 큐 자동 삭제 (`_queues.pop`)
- 프론트엔드는 `terminated` 플래그로 SSE 종료 후 브라우저 자동 재연결 `onerror` 억제

---

## 13. 운영 메모

- **에러 처리**: 각 파이프라인 단계 예외 → `job.err` 기록 + `job_error` SSE → 후속 단계 중단
- **비용 절감**: Claude system 프롬프트에 `cache_control` 적용, 재처리 시 vision 캐시 활용
- **재처리**: `slides/`, `vision/`, `audio/` 디렉터리 삭제 후 재생성하면 해당 단계부터 재실행
- **CQI 반영 분할**: `cqi_adapter.apply()`는 슬라이드를 5장씩 나눠 호출 — 응답 JSON이 max_tokens에서 잘리는 것을 방지 (한 묶음 실패 시 그 묶음만 원본 유지)
- **Python 3.9 호환**: 타입 힌트에 `int | None` 대신 `Optional[int]` 사용 (union 문법 3.10+)
