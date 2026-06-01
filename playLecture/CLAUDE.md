# playLecture — 강의 운영 웹 (✅ 구현 완료)

> createLecture에서 생성한 강의를 수강생에게 서비스하고, 학습 데이터(난이도·질문·키워드·진도)를 수집해 analyzeLecture에 제공한다.

---

## 1. 개요

| 항목 | 내용 |
|------|------|
| 스택 | FastAPI + SQLite (SQLAlchemy async) + 바닐라 JS |
| 포트 | 8001 |
| DB | `storage/play.db` |
| 진입점 | `http://localhost:8001` (수강생) / `http://localhost:8001/admin` (관리자) |

---

## 2. createLecture 연동 방식

### 파일시스템 직접 공유 (포털 메인 흐름)

`CREATELECTURE_STORAGE_ROOT` 환경변수로 createLecture의 `storage/lectures/` 디렉터리를 지정하면,
ZIP 업로드 없이 createLecture에서 제작한 강의를 즉시 재생할 수 있다.

```
GET /api/lectures/{id}
 → DB에 없으면 createLecture storage에서 lecture.json 읽기 → DB 자동 등록
 → 이후 /static/{id}/... 도 두 storage 모두 탐색
```

### ZIP 업로드 (직접 등록)

관리자 페이지(`/admin`)에서 ZIP 파일을 직접 업로드해도 등록 가능.
ZIP 포맷은 `LECTURE_EXPORT_FORMAT.md` 참조.

---

## 3. 데이터 모델

```sql
-- 사용자 인증
CREATE TABLE users    (id, username, display_name, hashed_password, created_at);
CREATE TABLE sessions (token PK, user_id FK, created_at);

-- 강의
CREATE TABLE lectures (
    id TEXT PK,          -- lecture_id (예: 2026-05-21_2c460bf9)
    title, created_at, slide_count, seg_count, duration_ms, registered_at
);

-- 수강 데이터 (analyzeLecture 입력 소스)
CREATE TABLE progress (
    user_id TEXT, lecture_id TEXT,          -- PK(user_id, lecture_id)
    slide_idx, seg_idx, pct, updated_at
);
CREATE TABLE chat_messages (
    id PK, user_id FK, lecture_id, slide_idx,
    display_name, message TEXT(max 500), created_at
);
CREATE TABLE difficulty_ratings (
    user_id TEXT, lecture_id TEXT, slide_idx INTEGER,  -- PK 복합
    rating INTEGER,                                    -- 0:쉬움 1:보통 2:어려움
    updated_at
);
CREATE TABLE slide_keywords (
    lecture_id TEXT, slide_idx INTEGER, keyword TEXT,  -- PK 복합
    count INTEGER
);
```

---

## 4. REST API

### 공개 (수강생)
| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/register` | 회원가입 |
| POST | `/login` | 로그인 → 세션 토큰 |
| POST | `/logout` | 로그아웃 |
| GET  | `/me` | 현재 사용자 정보 |
| GET  | `/api/lectures` | 강의 목록 |
| GET  | `/api/lectures/{id}` | lecture.json 전체 (createLecture storage에서 자동 임포트) |
| GET  | `/api/progress/{lecture_id}` | 내 수강 진도 |
| PUT  | `/api/progress/{lecture_id}` | 진도 저장 |
| POST | `/api/progress/{lecture_id}` | 진도 저장 (sendBeacon 전용 — PUT과 동일 로직) |
| GET  | `/api/chat/{lecture_id}/{slide_idx}` | 슬라이드 채팅 조회 |
| POST | `/api/chat/{lecture_id}/{slide_idx}` | 채팅 전송 (키워드 자동 추출) |
| GET  | `/api/difficulty/{lecture_id}/{slide_idx}` | 슬라이드 난이도 조회 |
| GET  | `/api/difficulty/{lecture_id}` | 강의 전체 슬라이드 평균 난이도 |
| PUT  | `/api/difficulty/{lecture_id}/{slide_idx}` | 난이도 평가 저장/수정 |

### 관리자 (HTTP Basic Auth: admin / ADMIN_PASSWORD)
| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST   | `/admin/upload` | ZIP 업로드 → 압축 해제 → DB 등록 |
| DELETE | `/admin/lectures/{id}` | 강의 + 모든 analytics 데이터 삭제 |
| GET    | `/admin/lectures` | 전체 강의 목록 |
| GET    | `/admin/analytics/{lecture_id}` | analyzeLecture용 통합 분석 데이터 |

#### Analytics API 응답 구조
```json
{
  "lecture_id": "...", "title": "...", "slide_count": N,
  "slides": [{
    "slide_idx": 0,
    "difficulty": { "쉬움": 2, "보통": 5, "어려움": 3, "total": 10 },
    "keywords":   [{ "keyword": "역전파", "count": 4 }, ...],
    "questions":  [{ "display_name": "홍길동", "message": "...", "created_at": "..." }, ...]
  }]
}
```

### 정적 파일
```
GET /static/{lecture_id}/slides/slide_NNN.png
GET /static/{lecture_id}/audio/slide_NNN_seg_MM.mp3
GET /static/{lecture_id}/audio/slide_NNN_seg_MM.words.json
```
두 경로(playLecture storage → createLecture storage) 순서로 탐색.

---

## 5. 키워드 추출 (`app/utils/keywords.py`)

채팅 메시지 저장 시 자동 실행. 같은 키워드가 반복되면 `slide_keywords.count` 증가.

**처리 규칙:**
- 한국어: 조사·어미 최장 일치 제거 (`_KO_SUFFIXES` — 길이 내림차순 정렬)
  - 예: `신경망의` → `신경망`, `궁금합니다` → (스톱워드 처리)
  - 어근 2글자 미만이면 제거
- 영어: 소문자 정규화 (`Backpropagation` → `backpropagation`)
- 최소 2글자 이상
- 스톱워드 제거 (조사, 대명사, 접속사, 인사말 등)

---

## 6. 플레이어 주요 동작

- **자동 진행**: 세그먼트 오디오 종료 → 다음 세그먼트 자동 재생
- **진도 저장**: 세그먼트 진행마다 2초 디바운스로 `PUT /api/progress`
- **탭 닫기 안전 저장**: `beforeunload` → `navigator.sendBeacon` (POST) + 토큰 쿼리 파라미터
- **이어보기**: 페이지 로드 후 `GET /api/progress` → 배너 표시 → 클릭 시 해당 위치로 이동
- **실시간 난이도 그래프**: 30초 폴링으로 `GET /api/difficulty/{lecture_id}` → 현재 슬라이드까지 막대 표시

---

## 7. ZIP 재업로드 동작

동일 `lecture_id`의 ZIP 재업로드 시:
1. `difficulty_ratings`, `chat_messages`, `slide_keywords`, `progress` cascade delete
2. 기존 `Lecture` 행 삭제
3. 새 파일 압축 해제 → DB 재등록

---

## 8. 인증 흐름

```
POST /register → 사용자 생성
POST /login    → 세션 토큰 발급 (localStorage에 저장)
모든 수강생 API → Authorization: Bearer {token}
sendBeacon PUT → /api/progress/{id}?token={token}  (헤더 불가)
```

---

## 9. 디렉터리 구조

```
playLecture/
├── CLAUDE.md
├── LECTURE_EXPORT_FORMAT.md     ← ZIP 스키마
├── requirements.txt
├── .env.example                 # ADMIN_PASSWORD, SECRET_KEY, CREATELECTURE_STORAGE_ROOT
├── app/
│   ├── main.py
│   ├── config.py                # CREATELECTURE_STORAGE_ROOT 환경변수 포함
│   ├── database.py
│   ├── models.py
│   ├── schemas.py
│   ├── api/
│   │   ├── admin.py             # 업로드·삭제·analytics (cascade delete 포함)
│   │   ├── auth.py              # register·login·logout·me
│   │   ├── chat.py              # 채팅 저장 + 키워드 추출 트리거
│   │   ├── deps.py              # get_current_user (Bearer 헤더 + ?token= fallback)
│   │   ├── difficulty.py        # 난이도 CRUD + 전체 평균
│   │   ├── lectures.py          # 강의 목록·상세 (createLecture 자동 임포트 포함)
│   │   └── progress.py          # 진도 저장 (PUT + POST 별칭)
│   └── utils/
│       └── keywords.py          # 한국어 형태소 처리 키워드 추출
├── web/
│   ├── index.html               # 강의 목록
│   ├── player.html              # 강의 플레이어
│   ├── admin.html               # 관리자 (ZIP 업로드)
│   ├── css/{common,index,player,admin}.css
│   └── js/
│       ├── auth.js
│       ├── index.js
│       ├── player.js            # 재생·진도·난이도·채팅·실시간 그래프
│       ├── overlay.js
│       └── subtitle.js
└── storage/
    ├── play.db
    └── lectures/{lecture_id}/   # ZIP 업로드 또는 자동 임포트 결과
```

---

## 10. 실행 방법

```bash
cd EDUTECH-3/playLecture
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# .env:
#   ADMIN_PASSWORD=changeme
#   SECRET_KEY=랜덤문자열
#   CREATELECTURE_STORAGE_ROOT=/path/to/createLecture/storage/lectures  # 파일시스템 공유
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
# → http://localhost:8001         수강생 강의 목록
# → http://localhost:8001/admin   관리자
```
