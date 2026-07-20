# EDUTECH-3 — AI 강의 제작 · 운영 · 분석 시스템

> **4개의 독립 서브시스템**으로 구성된 AI 기반 강의 사이클 (전 서비스 구현 완료).
> portal(과목 관리) → createLecture(제작) → playLecture(운영) → analyzeLecture(분석) → createLecture(CQI 개선)

---

## 1. 전체 흐름

```
[교수자]
   │
   ├─ portal (포트 8003)                ← 시작점: 과목 · 주차 관리
   │   과목 등록 → 주차별 강의 추가 → 각 서비스로 이동
   │   서비스 상태: course+week 기반 자동 감지
   │   TeachingFlow 흐름 다이어그램 (시각 전용)
   │
   ├─ createLecture (포트 8000)          ← 강의 제작
   │   PPT 업로드 → Claude Vision 분석 → TTS 음성 생성
   │   → 스크립트 편집 → 강조 효과 지정
   │   → lecture.json + 슬라이드·오디오 파일 생성
   │   ※ CQI 모드: 이전 수강생 피드백 텍스트 → 스크립트 자동 보강
   │   ※ 포털에서만 진입 가능 (from 파라미터 필수)
   │
   ├─ playLecture (포트 8001)            ← 강의 운영
   │   createLecture storage 직접 참조 (파일시스템 공유)
   │   → ZIP 업로드 없이 즉시 서비스 가능
   │   수강생: 로그인 → 강의 재생 → 진도 저장 → 이어보기
   │   수집 데이터:
   │     · 슬라이드별 난이도 평가 (0:쉬움 / 1:보통 / 2:어려움)
   │     · 슬라이드별 채팅 질문 전문
   │     · 슬라이드별 키워드 집계 (한국어 형태소 처리)
   │     · 수강 진도율 (beforeunload sendBeacon으로 안전 저장)
   │
   ▼
[Analytics API]  GET /admin/analytics/{lecture_id}
   │
   ├─ analyzeLecture (포트 8002)         ← 학습 분석
   │   포털의 "학습 분석" 클릭 → /week-analyze?course=X&week=Y 페이지 진입
   │   course+week 단위로 강의 일괄 분석
   │   Claude API로 슬라이드별 혼란도 지수 산출
   │   → 핵심 미이해 개념 추출 → CQI 보고서 생성
   │
   ▼
[CQI 보고서 JSON]
   │
   └─ createLecture CQI 입력
       슬라이드 스크립트 보강 (CQI 피드백 텍스트 입력 방식)
```

---

## 2. 서브시스템 요약

### portal — 강의 포털 (✅ 구현 완료)

| 항목 | 내용 |
|------|------|
| 역할 | 과목·주차별 강의 관리, TeachingFlow 흐름 시각화, 서비스 간 네비게이션 |
| 스택 | FastAPI + SQLite (SQLAlchemy async) + 바닐라 JS |
| 포트 | 8003 |
| DB | `courses`, `weekly_lectures` |
| 상태 감지 | `GET /api/status-week?course=X&week=Y` (course+week 기반) |
| 상세 | [`portal/CLAUDE.md`](./portal/CLAUDE.md) |

---

### createLecture — 강의 제작 웹 (✅ 구현 완료)

| 항목 | 내용 |
|------|------|
| 역할 | PPT → AI 분석 → TTS → 강의 파일 생성 |
| 스택 | FastAPI + Claude API (Vision) + Edge TTS + 바닐라 JS |
| 포트 | 8000 |
| 진입 | 포털에서 `from` 파라미터 포함 URL로만 접근 가능 |
| 상세 | [`createLecture/CLAUDE.md`](./createLecture/CLAUDE.md) |

**핵심 흐름:**
1. 포털에서 컨텍스트(course, week, week_title) 포함 URL로 진입
2. PPT 업로드 → LibreOffice로 PNG 변환
3. Claude Vision API로 슬라이드별 스크립트 + 강조 좌표 추출
4. *(CQI 모드)* 수강생 피드백 텍스트 → Claude API로 스크립트 자동 보강
5. 스크립트 편집 페이지에서 검토·수정·강조 영역 드래그 지정
6. Edge TTS로 구간별 MP3 + 어절 타이밍 생성 → `storage/lectures/{id}/` 저장
7. 강의 플레이어에서 재생·확인·녹화(WebM)
8. playLecture가 같은 storage를 직접 참조 → 즉시 서비스 가능

---

### playLecture — 강의 운영 웹 (✅ 구현 완료)

| 항목 | 내용 |
|------|------|
| 역할 | createLecture storage를 공유해 수강생에게 서비스, 학습 데이터 수집 |
| 스택 | FastAPI + SQLite (SQLAlchemy async) + 바닐라 JS |
| 포트 | 8001 |
| DB | `users`, `sessions`, `lectures`, `progress`, `chat_messages`, `difficulty_ratings`, `slide_keywords` |
| 연동 | `CREATELECTURE_STORAGE_ROOT`로 파일시스템 직접 공유 |
| 상세 | [`playLecture/CLAUDE.md`](./playLecture/CLAUDE.md) |

**Analytics API (analyzeLecture 입력 소스):**
```
GET /admin/analytics/{lecture_id}   (HTTP Basic Auth: admin / ADMIN_PASSWORD)

응답:
{
  "lecture_id": "...", "title": "...", "slide_count": N,
  "slides": [{
    "slide_idx": 0,
    "difficulty": { "쉬움": N, "보통": N, "어려움": N, "total": N },
    "keywords":   [{ "keyword": "역전파", "count": 3 }, ...],   // top-10
    "questions":  [{ "display_name": "홍길동", "message": "...", "created_at": "..." }, ...]
  }, ...]
}
```

---

### analyzeLecture — 학습 분석 웹 (✅ 구현 완료)

| 항목 | 내용 |
|------|------|
| 역할 | 수강 데이터 분석 → CQI 보고서 생성 |
| 스택 | FastAPI + Claude API (`claude-sonnet-4-6`) + httpx + 바닐라 JS |
| 포트 | 8002 |
| DB | `cqi_reports` |
| 진입 | 포털 "학습 분석" → `/week-analyze?course=X&week=Y` |
| 상세 | [`analyzeLecture/CLAUDE.md`](./analyzeLecture/CLAUDE.md) |

**CQI 보고서 구조:**
```json
{
  "lecture_id": "...", "lecture_title": "...", "generated_at": "...",
  "slides": [{
    "slide_idx": 2,
    "confusion_score": 0.82,
    "core_concepts": ["역전파", "gradient"],
    "recommended_action": "add_example",
    "cqi_instruction": "역전파의 연산 순서를 단계별로 수식 없이 설명하고 예시를 추가할 것.",
    "difficulty": { "쉬움": 1, "보통": 2, "어려움": 5, "total": 8 },
    "keywords": [...],
    "questions": [...]
  }]
}
```

---

## 3. 시스템 간 연동 인터페이스

### 3-1. createLecture → playLecture: 파일시스템 공유

```
createLecture storage/lectures/{id}/
  ├── lecture.json
  ├── slides/slide_NNN.png
  └── audio/slide_NNN_seg_MM.mp3 + .words.json

playLecture CREATELECTURE_STORAGE_ROOT → 동일 디렉터리 직접 참조
GET /api/lectures/{id} → DB에 없으면 자동 임포트
```

ZIP 파일 형식은 [`playLecture/LECTURE_EXPORT_FORMAT.md`](./playLecture/LECTURE_EXPORT_FORMAT.md) 참조 (직접 ZIP 업로드도 지원).

### 3-2. playLecture → analyzeLecture: Analytics API

```
GET http://localhost:8001/admin/analytics/{lecture_id}
Authorization: Basic admin:{ADMIN_PASSWORD}
```

### 3-3. analyzeLecture → createLecture: CQI 보고서

`GET /api/reports/{id}` 로 JSON 취득 후 createLecture의 CQI 피드백 텍스트 박스에 붙여넣기.
또는 분석 대시보드에서 JSON 다운로드 → createLecture에 붙여넣기.

### 3-4. portal → 각 서비스: 상태 프로브

```
portal GET /api/status-week?course=X&week=Y
  → GET createLecture /api/lectures?course=X&week=Y  (강의 존재 확인)
  → GET analyzeLecture /api/reports (lecture_id 필터, 최신 보고서 상태)
timeout=5s, 서비스 중단 시 graceful fallback.
```

### 3-5. portal → analyzeLecture: 주차별 분석 트리거

```
portal POST /api/proxy/analyze-week?course=X&week=Y
  → POST analyzeLecture /api/analyze-week?course=X&week=Y
analyzeLecture → GET createLecture /api/lectures?course=X&week=Y
              → GET playLecture /api/lectures/{id}  (자동 임포트)
              → BackgroundTask: Claude 분석 실행
```

---

## 4. 디렉터리 구조

```
EDUTECH-3/
├── CLAUDE.md                        ← 이 파일 (전체 개요)
├── portal/                          ← 강의 포털 ✅
│   ├── CLAUDE.md
│   ├── requirements.txt
│   ├── .env.example
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models.py                # Course, WeeklyLecture
│   │   └── api/courses.py           # CRUD + /api/status-week + /api/proxy/*
│   ├── web/
│   │   ├── index.html
│   │   ├── css/{common,portal}.css
│   │   └── js/portal.js
│   └── storage/portal.db
├── createLecture/                   ← 강의 제작 ✅
│   ├── CLAUDE.md
│   ├── app/
│   │   ├── api/{upload,jobs,lectures,scripts}.py
│   │   ├── services/{ppt_to_images,vision_analyzer,cqi_adapter,tts_synthesizer,lecture_builder}.py
│   │   └── utils/{sse,storage}.py
│   ├── web/
│   │   ├── index.html / scripts.html / player.html / week-lectures.html
│   │   └── js/{upload,scripts,player,overlay,subtitle,recorder,week-lectures}.js
│   └── storage/lectures/{id}/       ← playLecture가 직접 참조
├── playLecture/                     ← 강의 운영 ✅
│   ├── CLAUDE.md
│   ├── LECTURE_EXPORT_FORMAT.md
│   ├── app/
│   │   ├── api/{admin,auth,chat,deps,difficulty,lectures,progress}.py
│   │   └── utils/keywords.py        # 한국어 키워드 추출 (형태소 처리)
│   └── web/
└── analyzeLecture/                  ← 학습 분석 ✅
    ├── CLAUDE.md
    ├── app/
    │   └── api/analyze.py           # 모든 엔드포인트 + Claude 분석 로직
    │                                # (week-lectures, analyze-week 포함)
    └── web/
        ├── index.html / report.html  # ← 포털 버튼 포함
        └── week-analyze.html         # 포털 진입점 (course+week 분석)
```

---

## 5. 실행 방법

### 5-1. 일상 실행 — `scripts/` (권장)

최초 설치(5-2)를 마친 뒤에는 스크립트로 4개 서비스를 한 번에 다룬다.
venv activate 불필요 — 각 서비스의 `.venv/bin/uvicorn`을 직접 호출한다.

```bash
./scripts/start.sh              # 4개 전체 기동 + 헬스 체크
./scripts/start.sh portal       # 특정 서비스만
./scripts/start.sh --reload     # 코드 변경 자동 반영 (개발용)
./scripts/stop.sh               # 전체 종료
./scripts/stop.sh playLecture   # 특정 서비스만
./scripts/status.sh             # 서비스별 PID · HTTP 상태
# → 포털에서 시작: http://localhost:8003
```

| 파일 | 역할 |
|------|------|
| `scripts/_common.sh` | 서비스 표(디렉터리:포트) 단일 정의 — **서비스 추가 시 여기만 수정** |
| `scripts/start.sh` | 의존 순서 기동(portal이 나머지를 프로브하므로 마지막) 후 포트별 curl 검증 |
| `scripts/stop.sh` | SIGTERM → 10초 대기 → SIGKILL. 포트 점유 PID도 함께 정리 |
| `scripts/status.sh` | 상태 조회 |

- PID는 `run/`, 로그는 `logs/`에 기록 (둘 다 gitignore).
- start/stop 모두 멱등적 — 중복 실행해도 안전하다.
- `.venv` 또는 `.env`가 없는 서비스는 안내 메시지와 함께 건너뛰고 exit 1.
- analyzeLecture 루트는 302(리디렉션)가 정상 응답이다.

### 5-2. 최초 설치 — 서비스별 수동 절차

```bash
# portal (포트 8003) — 시작점
cd EDUTECH-3/portal
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # 기본값으로 사용 가능
uvicorn app.main:app --host 0.0.0.0 --port 8003 --reload
# → http://localhost:8003

# createLecture (포트 8000)
cd EDUTECH-3/createLecture
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # ANTHROPIC_API_KEY 입력
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
# → 포털에서 진입 (직접 접속 시 포털로 리디렉션)

# playLecture (포트 8001)
cd EDUTECH-3/playLecture
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# ADMIN_PASSWORD, SECRET_KEY 설정
# CREATELECTURE_STORAGE_ROOT=/path/to/createLecture/storage/lectures  (파일시스템 공유)
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
# → http://localhost:8001         수강생 강의 목록
# → http://localhost:8001/admin   관리자 (ZIP 등록)

# analyzeLecture (포트 8002)
cd EDUTECH-3/analyzeLecture
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# ANTHROPIC_API_KEY, PLAYLECTURE_URL, PLAYLECTURE_ADMIN_PASSWORD, CREATELECTURE_URL
uvicorn app.main:app --host 0.0.0.0 --port 8002 --reload
# → http://localhost:8002/week-analyze?...   주차별 분석 (포털에서 진입)
# → http://localhost:8002/report?id={id}    CQI 보고서
```

---

## 6. 주요 설계 결정 & 주의 사항

| 항목 | 결정 |
|------|------|
| createLecture→playLecture 연동 | ZIP 없이 파일시스템 직접 공유 (`CREATELECTURE_STORAGE_ROOT`) |
| 포털 상태 감지 단위 | lecture_id 아닌 course+week 기반 (`/api/status-week`) |
| 분석 진입점 | 포털 → analyzeLecture `/week-analyze` (course+week 파라미터 전달) |
| 포털 내비게이션 | 서비스 직접 링크 제거, 흐름 다이어그램은 시각 전용 |
| 뒤로가기 연동 | `from` URL 파라미터로 포털 URL 전달, 모든 서비스에서 "← 포털" 버튼 |
| 진도 저장 | `navigator.sendBeacon` (POST) + 쿼리 파라미터 토큰 fallback |
| 키워드 추출 | 한국어 조사/어미 최장 일치 제거, 영어 소문자 정규화 |
| CQI 슬라이드 누락 | Claude 응답에 없는 slide_idx는 stub 항목으로 자동 채움 |
| 분석 요청 검증 | playLecture에 lecture_id 없으면 즉시 404 (조용한 실패 방지) |
| 퀴즈·시험 연동 | 미구현 (A5, A6 단계) — playLecture 확장 후 추가 예정 |
