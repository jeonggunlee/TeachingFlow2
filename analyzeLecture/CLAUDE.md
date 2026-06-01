# analyzeLecture — 학습 분석 & CQI 보고서 생성 (✅ 구현 완료)

> playLecture에서 수집한 수강생 반응 데이터를 Claude API로 분석해 createLecture용 CQI 보고서를 생성하는 독립 웹 서비스.

---

## 1. 역할

| 항목 | 내용 |
|------|------|
| 스택 | FastAPI + SQLite (SQLAlchemy async) + 바닐라 JS |
| 포트 | 8002 |
| DB | `storage/db.sqlite3` |
| 진입점 | `http://localhost:8002/week-analyze?course=X&week=Y` (주차별 분석, 포털에서 진입) / `http://localhost:8002/report?id={id}` (보고서) |

---

## 2. 데이터 모델

### `cqi_reports` 테이블

```sql
CREATE TABLE cqi_reports (
    id            TEXT PRIMARY KEY,    -- UUID
    lecture_id    TEXT NOT NULL,       -- playLecture lecture_id
    lecture_title TEXT NOT NULL,
    generated_at  TEXT NOT NULL,       -- ISO 8601
    status        TEXT NOT NULL,       -- pending | processing | done | error
    error_message TEXT,
    report_json   TEXT                 -- 완성된 CQI JSON (done 상태에서만 존재)
);
```

---

## 3. REST API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET  | `/api/lectures` | playLecture 강의 목록 조회 (proxy) |
| GET  | `/api/week-lectures` | createLecture에서 특정 course+week 강의 목록 조회 (분석 상태 포함) |
| POST | `/api/analyze/{lecture_id}` | 단일 강의 분석 시작 (202 Accepted, 백그라운드 처리) |
| POST | `/api/analyze-week` | course+week 전체 강의 일괄 분석 시작 |
| GET  | `/api/reports` | 저장된 CQI 보고서 목록 |
| GET  | `/api/reports/{id}` | 보고서 상세 (report_json 포함) |
| DELETE | `/api/reports/{id}` | 보고서 삭제 |

### `GET /api/week-lectures?course=X&week=Y` 응답
```json
[
  {
    "lecture_id": "2026-05-24_c4efeb5d",
    "title": "딥러닝 기초-1주차",
    "created_at": "...",
    "slide_count": 10,
    "analyze_status": "done",
    "report_id": "ff336de3-...",
    "report_generated_at": "..."
  }
]
```
- createLecture `/api/lectures?course=X&week=Y` 로 강의 목록 조회
- 각 강의에 대해 analyzeLecture DB에서 최신 보고서 상태 병합

### `POST /api/analyze-week?course=X&week=Y` 동작
1. createLecture에서 course+week 강의 목록 조회
2. 각 강의를 playLecture에 자동 임포트 시도 (`GET /api/lectures/{id}`)
3. 강의별 CQIReport(status=pending) DB 저장 + BackgroundTask 시작

**`POST /api/analyze/{lecture_id}` 동작:**
- 이미 `processing` 상태인 보고서가 있으면 409 반환
- playLecture `/admin/lectures`에서 강의 존재 확인 → 없으면 404 반환 (조용한 실패 방지)
- `CQIReport(status=pending)` DB 저장 → BackgroundTask 시작 → `{"report_id": "...", "status": "pending"}` 반환

---

## 4. 분석 파이프라인

```
POST /api/analyze/{lecture_id}
  │
  ├── 강의 존재 확인 (fetch_lectures → 404 if not found)
  ├── CQIReport(status=pending) DB 저장
  ├── BackgroundTask 시작
  │
  └── run_analysis(report_id)
        │
        ├── 1. playLecture Analytics API 호출
        │      GET /admin/analytics/{lecture_id}
        │      → slides[i].{ difficulty, keywords, questions }
        │
        ├── 2. Claude 프롬프트 구성 (_build_prompt)
        │      · 슬라이드별 난이도 분포, 키워드(top-5), 질문(최대 10건)
        │      · confusion_score / core_concepts / recommended_action / cqi_instruction 요청
        │
        ├── 3. Claude API 호출 (claude-sonnet-4-6, max_tokens=4096)
        │      → JSON 응답 파싱 (```json 블록 자동 제거)
        │
        ├── 4. Analytics 원본 데이터 병합 (difficulty, keywords, questions 추가)
        │      · covered_indices 추적 → Claude가 누락한 슬라이드에 stub 항목 자동 추가
        │      · slide_idx 오름차순 정렬
        │
        └── 5. CQIReport(status=done, report_json=...) DB 업데이트
```

---

## 5. CQI 보고서 JSON 구조

```json
{
  "lecture_id": "2026-05-21_2c460bf9",
  "lecture_title": "인공지능의 개요",
  "generated_at": "2026-05-24T...",
  "slides": [
    {
      "slide_idx": 2,
      "confusion_score": 0.78,
      "core_concepts": ["역전파", "gradient 소실"],
      "recommended_action": "add_example",
      "cqi_instruction": "역전파의 연산 순서를 단계별로 수식 없이 직관적으로 설명하고 2층 신경망 예시를 추가할 것.",
      "difficulty": { "쉬움": 1, "보통": 2, "어려움": 5, "total": 8 },
      "keywords": [{ "keyword": "역전파", "count": 3 }, ...],
      "questions": [{ "display_name": "홍길동", "message": "...", "created_at": "..." }, ...]
    }
  ]
}
```

**confusion_score 산출 기준 (Claude 지시):**
- 어려움 가중치 1.0, 보통 0.4, 쉬움 0.0
- 질문 수 3건 이상이면 최대치에 기여
- 데이터 없으면 0.0

**recommended_action 종류:**
| 값 | 의미 |
|----|------|
| `enhance_script` | 기존 설명을 더 쉽게 풀어써야 할 때 |
| `add_slide` | 별도 슬라이드로 개념을 분리해야 할 때 |
| `add_example` | 구체적 예시나 시각화가 부족할 때 |
| `no_action` | confusion_score < 0.3 이고 질문이 없을 때 |

---

## 6. 페이지 구성

### 주차별 분석 (`week-analyze.html`) — 메인 진입점
포털에서 "학습 분석" 클릭 시 진입하는 메인 분석 페이지.
- URL: `/week-analyze?course=X&week=Y&week_title=Z&from=http://localhost:8003`
- 컨텍스트 바: "← 포털로 돌아가기", 교과목명 chip, 주차 제목
- 해당 course+week의 강의 목록 + 분석 상태 카드 표시
- "📊 이 주차 전체 분석 시작" 버튼
- 분석 진행 중 4초 폴링으로 상태 갱신

### 보고서 (`report.html`)
- 상단: "← 포털로 돌아가기" 버튼 (`from` URL 파라미터로 href 설정)
- 슬라이드별 카드: confusion_score 히트맵 색상, recommended_action 배지, core_concepts 태그
- **평균 난이도 막대 그래프**: HTML Canvas (devicePixelRatio 지원)
- 질문 목록 + 키워드 태그 표시
- **JSON 내보내기**: 보고서 전체를 `.json` 파일로 다운로드

---

## 7. 디렉터리 구조

```
analyzeLecture/
├── CLAUDE.md
├── requirements.txt
├── .env.example
├── storage/
│   └── db.sqlite3          ← CQI 보고서 저장
├── app/
│   ├── main.py             ← FastAPI 진입점, /week-analyze 라우트 포함
│   ├── config.py           ← ANTHROPIC_API_KEY, PLAYLECTURE_URL, CREATELECTURE_URL
│   ├── database.py         ← SQLAlchemy 엔진·세션
│   ├── models.py           ← CQIReport 테이블
│   └── api/
│       └── analyze.py      ← 모든 API 엔드포인트 + Claude 분석 로직
│                              (week-lectures, analyze-week 엔드포인트 포함)
└── web/
    ├── week-analyze.html   ← 주차별 분석 페이지 (포털에서 진입, 메인 진입점)
    ├── report.html         ← CQI 보고서 상세 뷰어 (← 포털 버튼 포함)
    ├── css/
    │   ├── common.css      ← CSS 변수·공통 스타일 (다크 테마, .nav-portal-back 포함)
    │   └── analyze.css     ← 분석 전용 스타일
    └── js/
        ├── week-analyze.js ← 주차별 강의 목록·분석 시작·폴링
        └── report.js       ← 보고서 상세·히트맵·슬라이드 카드·JSON 내보내기 (포털 back 버튼 href 설정)
```

---

## 8. 실행 방법

```bash
cd EDUTECH-3/analyzeLecture
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# .env 편집:
#   ANTHROPIC_API_KEY=sk-ant-...
#   PLAYLECTURE_URL=http://localhost:8001
#   PLAYLECTURE_ADMIN_PASSWORD=changeme
#   CREATELECTURE_URL=http://localhost:8000

uvicorn app.main:app --host 0.0.0.0 --port 8002 --reload
# → http://localhost:8002                        대시보드
# → http://localhost:8002/week-analyze?...       주차별 분석 (포털에서 진입)
# → http://localhost:8002/report?id=             CQI 보고서
```

---

## 9. 향후 확장

| 단계 | 내용 |
|------|------|
| A5 | 퀴즈 정답률 연동 (playLecture 퀴즈 기능 구현 후) |
| A6 | 시험 결과 연동 |
