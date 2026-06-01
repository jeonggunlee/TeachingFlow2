# HALLYM EDUTECH — AI 기반 강의 생성 (Lecture Creation) 웹 시스템

> PPT → 슬라이드 이미지 → AI 분석 → TTS 음성 생성 → 웹 재생 + 강조 효과 + 자막 + 영상 녹화

> **Status:** ✅ **구현 완료** — CQI 피드백 기반 스크립트 자동 개선 + TTS 전 스크립트 편집 + 마우스 드래그 강조 영역 지정 + TTS 후 재편집 지원 + 포털 연동.

---

## 1. 개요

PPT를 입력 받아 슬라이드 페이지 이미지를 생성한 후, 페이지별로 Claude Vision API로 분석하여 강의 스크립트를 생성하고,
Edge TTS로 음성을 만든 뒤, 웹 브라우저에서 음성 재생 시 해당 슬라이드 **음성 설명 영역**에
강조 효과를 표시하는 강의 생성 웹입니다.

**핵심 기능:**
- Claude Vision API로 슬라이드 구간별 스크립트 + 위치(%) 자동 추출
- **CQI 피드백 입력**: 이전 강의 수강생 피드백을 Claude API로 분석해 스크립트 자동 개선
- **스크립트 편집 단계**: Vision 분석 완료 후 TTS 전 사용자가 세그먼트별 스크립트·키워드 검토·수정
- **마우스 드래그 강조 영역 지정**: 슬라이드 이미지 위에서 드래그로 강조 영역을 직관적으로 지정 (모달 UI)
- **TTS 후 재편집 지원**: TTS 완료 후에도 스크립트·강조 영역 수정 및 재합성 가능
- Edge TTS(한국어)로 구간별 음성 파일 생성 (스크립트 확정 후 실행)
- 구간별 강조 방식 선택: **형광펜** 또는 **체크 심볼**
- 음성 재생 중 해당 세그먼트에 강조 효과 표시 (Canvas 오버레이)
- 음성과 동기화된 실시간 자막 (2줄 고정 높이, 현재 어절 강조)
- 업로드 처리 중 실시간 SSE 진행바 표시
- 재생 화면(슬라이드 + 효과 + 자막)을 WebM 영상으로 녹화·다운로드
- **강의 목록 라이브러리**: 메인 페이지에서 완료된 강의 목록 조회·재생·편집 (course/week 필터 지원)
- **포털 필수 진입**: 업로드 페이지는 포털에서만 진입 가능 (`from` 파라미터 없으면 포털로 리디렉션)
- **주차별 강의 목록 페이지** (`/week-lectures`): 특정 교과목·주차의 강의 목록 + 재생·편집 링크

---

## 2. 기술 스택

| 영역 | 기술 |
|------|------|
| Backend | FastAPI (Python) + uvicorn |
| AI 분석 | Claude API (`claude-sonnet-4-6`), Vision 기능 |
| TTS | Edge TTS (`ko-KR-InJoonNeural`) |
| 진행률 스트림 | SSE (`asyncio.Queue` 기반, `/api/jobs/{id}/events`) |
| Frontend | 바닐라 HTML/CSS/JS (프레임워크 없음) |
| 강조 효과 | HTML Canvas 오버레이 (object-fit:contain 역산으로 정확한 좌표 계산) |
| 자막 동기화 | `audio.timeupdate` 이벤트 + 단어 인덱스 계산, 2줄 고정 높이 |
| 영상 녹화 | `MediaRecorder` API + `canvas.captureStream()` + Web Audio API |

---

## 3. 시스템 아키텍처

```
[포털 (8003)]
   │  교과목·주차 컨텍스트 포함 URL로 이동 (?from=&course=&week=&week_title=)
   ▼
[createLecture 업로드 페이지 (/)]  ← from 파라미터 없으면 포털로 리디렉션
   │  PPT 업로드 + (선택) CQI 피드백 텍스트
   ▼
[FastAPI Backend — Phase 1]
   │  ① PPT → PDF (LibreOffice headless) → PNG (pdf2image, 150 DPI)
   │  ② 슬라이드별 Claude Vision 호출 → segments JSON
   │  ③ meta.json 저장 (course, week 컨텍스트)
   │  ④ (CQI 있을 때) Claude API로 스크립트 개선
   │  ⑤ SSE: scripts_ready → /scripts 페이지로 이동
   ▼
[스크립트 편집 페이지 /scripts]
   │  ← 포털 버튼 (scripts.js가 from 파라미터로 href 설정)
   │  세그먼트별 스크립트·키워드 검토·편집·드래그 강조 영역 지정
   │  "TTS 생성 시작" → POST /api/lectures/{id}/synthesize
   ▼
[FastAPI Backend — Phase 2]
   │  TTS → MP3 + 어절 타이밍 → lecture.json 빌드
   │  SSE: done → 완료 패널 표시 (자동 이동 안 함)
   ▼
[강의 플레이어 /player]  또는  [주차별 강의 목록 /week-lectures]
```

핵심 컴포넌트:
- **Ingestor** (`ppt_to_images.py`): PPT → PDF → PNG 변환
- **Analyzer** (`vision_analyzer.py`): Claude Vision 호출, 슬라이드별 병렬 처리
- **CQI Adapter** (`cqi_adapter.py`): Claude API로 수강생 피드백 반영 스크립트 개선
- **Synthesizer** (`tts_synthesizer.py`): Edge TTS 호출 / SentenceBoundary 어절 분배
- **SSE** (`utils/sse.py` + `api/jobs.py`): asyncio.Queue 기반 실시간 진행 스트림
- **Library** (`lectures.py`): 완료 강의 목록 API (course/week 필터 지원)

---

## 4. 디렉터리 구조

```
createLecture/
├── CLAUDE.md
├── requirements.txt
├── .env.example
├── app/
│   ├── main.py            # /week-lectures 라우트 포함
│   ├── config.py
│   ├── api/
│   │   ├── upload.py      # POST /api/upload, meta.json에 course/week 저장
│   │   ├── jobs.py        # GET /api/jobs/{id}/events (SSE)
│   │   ├── lectures.py    # GET /api/lectures?course=&week= (필터), GET/{id}, DELETE/{id}
│   │   └── scripts.py     # GET/PUT /scripts, POST /synthesize, POST /rebuild-json
│   ├── services/
│   │   ├── ppt_to_images.py
│   │   ├── vision_analyzer.py
│   │   ├── cqi_adapter.py
│   │   ├── tts_synthesizer.py
│   │   └── lecture_builder.py
│   └── utils/
│       ├── storage.py
│       └── sse.py
├── web/
│   ├── index.html          # 업로드 폼 (포털 필수 진입, 컨텍스트 바 표시)
│   ├── scripts.html        # 스크립트 편집 + ← 포털 버튼
│   ├── player.html         # 강의 플레이어
│   ├── week-lectures.html  # 교과목·주차별 강의 목록 (재생/편집 링크 포함)
│   ├── css/
│   │   ├── common.css
│   │   ├── scripts.css     # .portal-back-btn 스타일 포함
│   │   └── player.css
│   └── js/
│       ├── upload.js       # 포털 진입 강제, 컨텍스트 바, SSE, 강의 목록
│       ├── scripts.js      # 스크립트 편집, from 파라미터로 포털 뒤로가기 버튼 설정
│       ├── week-lectures.js # /week-lectures 페이지 로직
│       ├── player.js
│       ├── overlay.js
│       ├── subtitle.js
│       └── recorder.js
└── storage/
    └── lectures/{lecture_id}/
        ├── source.pptx / source.pdf
        ├── slides/
        ├── vision/
        ├── audio/
        ├── meta.json       # { course, week } — 포털 컨텍스트 보관
        ├── cqi.txt
        ├── job.err
        └── lecture.json
```

---

## 5. 주요 API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/upload` | PPT 업로드, course/week를 meta.json에 저장 |
| GET  | `/api/jobs/{id}/events` | SSE 진행 스트림 |
| GET  | `/api/lectures` | 완료 강의 목록 (course=, week= 쿼리 필터 지원) |
| GET  | `/api/lectures/{id}` | lecture.json 반환 |
| DELETE | `/api/lectures/{id}` | 강의 디렉터리 삭제 |
| GET  | `/api/lectures/{id}/scripts` | vision JSON + has_lecture_json 반환 |
| PUT  | `/api/lectures/{id}/scripts` | 편집된 slides 배열 저장 |
| POST | `/api/lectures/{id}/synthesize` | TTS Phase2 시작 |
| POST | `/api/lectures/{id}/rebuild-json` | TTS 없이 lecture.json만 재빌드 |
| GET  | `/` | index.html (업로드 페이지) |
| GET  | `/scripts` | scripts.html |
| GET  | `/player` | player.html |
| GET  | `/week-lectures` | week-lectures.html (교과목·주차별 강의 목록) |
| GET  | `/static/lectures/{id}/...` | 슬라이드·오디오 정적 서빙 |

**`GET /api/lectures` 응답 항목:**
```json
{
  "lecture_id": "2026-05-24_c4efeb5d",
  "title": "딥러닝 기초-1주차",
  "created_at": "...",
  "slide_count": 10,
  "segment_count": 28,
  "has_cqi": false,
  "course": "딥러닝 기초",
  "week": "1"
}
```

---

## 6. 포털 연동 URL 파라미터

업로드 페이지·스크립트 편집·주차별 목록 모두 아래 파라미터를 URL로 전달받아 컨텍스트 바 표시:

| 파라미터 | 설명 |
|----------|------|
| `from` | 돌아갈 URL (포털 기본값: `http://localhost:8003`) |
| `course` | 교과목명 |
| `week` | 주차 번호 |
| `week_title` | 강의 제목 |

`from` 없이 업로드 페이지 접근 시 → 포털(`http://localhost:8003`)로 강제 리디렉션.

---

## 7. playLecture 연동

ZIP 내보내기 없이 **파일시스템 직접 공유** 방식:
- createLecture의 `storage/lectures/` 디렉터리를 playLecture가 직접 참조
- playLecture의 `GET /api/lectures/{id}` 호출 시 자신의 storage에 없으면 createLecture storage에서 자동 임포트
- ZIP 업로드 과정 불필요 — 강의 제작 완료 즉시 playLecture에서 재생 가능

---

## 8. 실행 방법

```bash
# 시스템 패키지 (최초 1회)
sudo apt-get install -y libreoffice poppler-utils fonts-noto-cjk

cd EDUTECH-3/createLecture
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # ANTHROPIC_API_KEY 입력

uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
# → http://localhost:8000  (포털에서 진입해야 함)
```

> **주의:** 업로드 페이지는 포털에서 직접 링크로만 접근 가능. 직접 접속 시 `http://localhost:8003`으로 리디렉션됨.
