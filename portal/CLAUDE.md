# portal — 강의 포털 (✅ 구현 완료)

> 교수자가 과목과 주차별 강의를 등록·관리하고, createLecture → playLecture → analyzeLecture 세 서비스의 진행 상태를 한 화면에서 파악할 수 있는 시작점.

---

## 1. 역할

| 항목 | 내용 |
|------|------|
| 스택 | FastAPI + SQLite (SQLAlchemy async) + 바닐라 JS |
| 포트 | 8003 |
| DB | `storage/portal.db` |
| 진입점 | `http://localhost:8003` |

---

## 2. 화면 구성

```
┌── 상단 내비 ──────────────────────────────────────────────┐
│ 🎓 HALLYM EDUTECH  |  강의 포털              [관리자 로그인] │
├── TeachingFlow 흐름 다이어그램 (시각 전용, 링크 없음) ────────┤
│  [📝 강의 제작] → [▶ 강의 운영] → [📊 학습 분석] ↺ [🔄 CQI] │
├── 사이드바(250px) ──┬── 과목 콘텐츠 ───────────────────────┤
│                    │  CS401 딥러닝 기초 · 2024-1          │
│  [+ 과목]          │                    [+ 주차] [과목 삭제]│
│  ──────────        │  ┌─ 1주차 딥러닝 개요 ──────────────┐ │
│  ✦ 딥러닝 기초     │  │[📝 제작됨]→[▶ 재생 가능]→[📊 분석]│ │
│    머신러닝 심화    │  └──────────────────────────────────┘ │
└────────────────────┴────────────────────────────────────────┘
```

**상단 내비:** 로그인/로그아웃 버튼만 표시 (서비스 직접 링크 없음).
**흐름 다이어그램:** TeachingFlow 개념 시각화 전용 — 클릭 링크 없음, 포트 정보 없음.

---

## 3. 데이터 모델

```sql
-- 과목
CREATE TABLE courses (
    id          TEXT PRIMARY KEY,   -- 8자 UUID
    name        TEXT NOT NULL,
    code        TEXT DEFAULT '',
    semester    TEXT DEFAULT '',
    description TEXT DEFAULT '',
    created_at  TEXT NOT NULL       -- ISO 8601
);

-- 주차별 강의
CREATE TABLE weekly_lectures (
    id         TEXT PRIMARY KEY,
    course_id  TEXT NOT NULL REFERENCES courses(id),
    week       INTEGER NOT NULL,
    title      TEXT DEFAULT '',
    lecture_id TEXT DEFAULT '',     -- 레거시 필드 (현재 사용 안 함)
    note       TEXT DEFAULT '',
    created_at TEXT NOT NULL
);
```

`lecture_id` 필드는 이전 버전의 레거시. 현재는 course+week로 강의를 식별한다.

---

## 4. REST API

### 설정
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/config` | 각 서비스 URL 반환 (프론트엔드에서 링크 생성에 사용) |

### 과목 CRUD
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET    | `/api/courses` | 과목 목록 |
| POST   | `/api/courses` | 과목 생성 |
| DELETE | `/api/courses/{id}` | 과목 + 소속 주차 전체 삭제 |

### 주차 CRUD
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET    | `/api/courses/{id}/weeks` | 주차 목록 (week 오름차순) |
| POST   | `/api/courses/{id}/weeks` | 주차 추가 |
| PUT    | `/api/courses/{id}/weeks/{wid}` | 주차 수정 |
| DELETE | `/api/courses/{id}/weeks/{wid}` | 주차 삭제 |

### 서비스 연동
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET  | `/api/status-week` | course+week 기반 상태 프로브 (createLecture·analyzeLecture 확인) |
| POST | `/api/proxy/analyze-week` | analyzeLecture 주차별 분석 트리거 (프록시) |
| GET  | `/api/proxy/lectures` | playLecture 강의 목록 (주차 추가 모달 드롭다운용) |

#### `/api/status-week?course=X&week=Y` 응답 구조
```json
{
  "has_lectures": true,
  "analyze_status": "done",
  "analyze_id": "ff336de3-..."
}
```
- `has_lectures`: createLecture에 해당 course+week 강의 존재 여부
- `analyze_status`: `null` | `"pending"` | `"processing"` | `"done"` | `"error"`
- `analyze_id`: 최신 CQI 보고서 ID (done 상태일 때)
- timeout=5s, 서비스 다운 시 graceful fallback

---

## 5. 주차 카드 스텝 상태 로직

상태는 **과목명(course) + 주차(week)** 기반으로 조회한다 (`loadStatus(week)` → `/api/status-week`).
과목 선택 시 모든 주차에 대해 일괄 상태 로드.

| 스텝 | 표시 조건 | 액션 |
|------|-----------|------|
| 📝 강의 제작 | 항상 표시 | "강의 제작하기" → createLecture (:8000) |
| ▶ 강의 운영 | `has_lectures` | "강의 제작 후 활성화" / "강의 열기" → playLecture |
| 📊 학습 분석 | `has_lectures` + 상태 | "분석 전" / "분석 중" / "보고서 완성" / "오류" |

**학습 분석 스텝 상세:**
- `has_lectures = false`: "⬜ 강의 제작 후 활성화"
- `analyze_status = null, 준비됨`: "⬜ 분석 전" + 분석 시작 버튼 + 분석 페이지 링크
- `analyze_status = pending/processing`: "⏳ 분석 진행 중..." + 분석 페이지 링크
- `analyze_status = done`: "✅ CQI 보고서 완성" + 보고서 링크 + 분석 페이지 링크
- `analyze_status = error`: "❌ 분석 오류" + 재시도 버튼

분석 시작/재시도 → `POST /api/proxy/analyze-week?course=X&week=Y` → 10초 간격 폴링.

---

## 6. 포털 → 서비스 이동 URL 파라미터

각 서비스 페이지로 이동할 때 다음 파라미터를 URL에 포함:

| 파라미터 | 설명 |
|----------|------|
| `from` | 포털 URL (`window.location.origin`, 뒤로가기용) |
| `course` | 교과목명 |
| `week` | 주차 번호 |
| `week_title` | 강의 제목 |

---

## 7. 로그인 및 인증

- 비밀번호 기반 단순 관리자 로그인 (모달)
- 토큰을 `localStorage`에 저장 (탭 간 공유 — createLecture 새 탭 열어도 유지)
- 로그인 전: 홍보(promo) 섹션 표시
- 로그인 후: 포털 섹션 표시

---

## 8. 디렉터리 구조

```
portal/
├── CLAUDE.md
├── requirements.txt        # fastapi, uvicorn[standard], sqlalchemy, aiosqlite, httpx, python-dotenv
├── .env.example
├── app/
│   ├── main.py             # FastAPI 앱, 라우터, StaticFiles
│   ├── config.py           # 환경변수 (서비스 URL)
│   ├── database.py         # SQLite async 엔진
│   ├── models.py           # Course, WeeklyLecture
│   └── api/
│       └── courses.py      # 모든 엔드포인트 (status-week, proxy/analyze-week 포함)
├── web/
│   ├── index.html          # 홍보 섹션 + 포털 섹션 (로그인 전/후)
│   ├── css/
│   │   ├── common.css      # 공통 CSS 변수 (다크 테마)
│   │   └── portal.css      # 흐름 다이어그램·주차 카드·사이드바 스타일
│   └── js/
│       └── portal.js       # 상태 관리, 렌더링, 이벤트 위임
└── storage/
    └── portal.db
```

---

## 9. 실행 방법

```bash
cd EDUTECH-3/portal
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# .env 기본값:
#   CREATELECTURE_URL=http://localhost:8000
#   PLAYLECTURE_URL=http://localhost:8001
#   PLAYLECTURE_ADMIN_PASSWORD=changeme
#   ANALYZELECTURE_URL=http://localhost:8002
uvicorn app.main:app --host 0.0.0.0 --port 8003 --reload
# → http://localhost:8003
```
