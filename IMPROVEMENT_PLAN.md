# EDUTECH-3 개선 계획 — 종합 분석 보고서

> Agent Team 분석 결과 (2026-05-25)
> createLecture · playLecture · analyzeLecture 3개 서비스 코드 검토 기반.
> 진행 상황은 체크박스로 갱신.

---

## 🎯 createLecture (강의 제작)

### 핵심 위험 (즉시 조치)

- [ ] **무인증 DELETE + path traversal 가능성**
  `DELETE /api/lectures/{id}`가 인증 없이 호출 가능, `lecture_id` 입력 검증 부재 → 임의 디렉토리 삭제 위험
- [ ] **SSE 큐 메모리 의존**
  모듈 전역 dict라 uvicorn 재시작·다중 워커 시 진행 상태 영구 손실
- [ ] **테스트 0건**
  회귀 검증 불가능

### 주요 추천 기능 (H 우선순위)

- [ ] **세그먼트 단위 미리듣기 + 차분 TTS**
  1개 세그먼트 수정에도 전체 재합성하는 비효율 해결
- [x] **analyzeLecture와 직접 연동** *(2026-05-25 완료)*
  `POST /api/cqi/import?report_url=` 추가, 사용자 수동 JSON 다운로드→붙여넣기 단계 제거
- [ ] **작업 큐 영속화**
  SQLite/Redis 기반
- [ ] **인증·인가 도입**
  최소 POST/PUT/DELETE 보호

---

## ▶ playLecture (강의 운영)

### 핵심 위험 (즉시 조치)

- [ ] **세션 무기한 유효**
  `Session` 모델에 `expires_at` 없음, 로그아웃 안 하면 영구 토큰
- [ ] **임시파일 경로 하드코딩**
  `Path(f"/tmp/{file.filename}")` (admin.py:40) → path traversal 가능
- [ ] **교수 권한이 username 추측**
  `chat.py`에서 `prof` 포함 여부로 판정, 누구나 `prof_hacker`로 가입 가능
- [x] **CQI 시그널 부족** *(2026-05-25 해결 — #2와 함께)*
  재생 행동(seek/pause/replay/speed) 미수집, 슬라이드 내 어느 세그먼트가 어려운지 추적 불가

### 주요 추천 기능 (H 우선순위)

- [x] **재생 행동 텔레메트리** *(2026-05-25 완료 — #2)*
  seek·pause·replay·speed 이벤트 수집 → CQI 시그널 질적 향상
- [ ] **WebSocket 실시간 채팅**
  현재 30초 폴링 — 강의 중 질의응답에 부적합
- [x] **퀴즈·체크포인트** *(2026-05-26 완료 — #3 Phase A~D)*
  A5/A6 단계 구현 완료, CQI 표본 확대
- [ ] **슬라이드 종료 시 난이도 자동 프롬프트**
  자발 응답 의존 → 응답률 향상
- [ ] **세션 만료 + httpOnly 쿠키**
  localStorage 토큰은 XSS 취약

---

## 📊 analyzeLecture (학습 분석)

### 핵심 위험 (즉시 조치)

- [ ] **CQI 응답 무검증**
  `confusion_score`가 0~1 범위 벗어나거나 `recommended_action` 오타도 그대로 저장 → 히트맵 깨짐
- [ ] **JSON 파싱 실패 시 재시도 없음**
  한 번 실패하면 즉시 `error` 상태
- [ ] **processing 상태 영구 갇힘**
  프로세스 크래시 시 recover 절차 없음
- [ ] **동시 실행 무제한**
  `analyze-week`이 강의 N개를 모두 병렬 호출 → rate-limit 위험

### 주요 추천 기능 (H 우선순위)

- [ ] **Anthropic tool-use로 스키마 강제**
  JSON 파싱 실패율 제거, 값 검증 자동
- [x] **createLecture 1-click 적용 API** *(2026-05-25 완료)*
  `POST /api/apply-cqi/{report_id}` → 사용자 수동 단계 제거
- [ ] **회차 간 비교 뷰**
  이전 보고서와 confusion_score 차이 ▲▼ — CQI 개선 효과 측정의 본질
- [ ] **세마포어 + Anthropic prompt caching**
  동시성 제한 + 비용 절감

---

## 🔁 공통 이슈 (Cross-cutting)

| 상태 | 문제 | 영향 서비스 | 우선순위 |
|------|------|------------|---------|
| ⏳ | **인증·인가가 일관성 없음** (createLecture는 무인증, playLecture는 약함, analyzeLecture는 평문 admin 패스워드 공유) | 전체 | **H** |
| ⏳ | **테스트 부재** | createLecture (확인), 추정 전 서비스 | **H** |
| ✅ | **수동 데이터 전달 단계 (JSON 다운로드→붙여넣기)** *(2026-05-25 해결)* | createLecture ↔ analyzeLecture | — |
| ⏳ | **장애 격리 부재** (한 서비스 다운 시 전파) | analyzeLecture가 playLecture/createLecture 의존 | **M** |
| ✅ | **퀴즈·체크포인트** *(2026-05-26 — #3)* | playLecture · createLecture · analyzeLecture | — |
| ⏳ | **SQLite 단일 writer 한계** | playLecture, analyzeLecture, portal | **L→M** |
| ✅ | **재생 행동 부재** *(2026-05-25 해결 — #2)* | playLecture | — |

---

## 🚀 최우선 권고 5가지 (전체 시스템 관점)

순차 진행용 체크리스트.

### 1. CQI 사이클 자동화 완성 ✅ *(2026-05-25 완료)*

analyzeLecture에 1-click 적용 API + createLecture에 직접 연동 가져오기 버튼 (수동 복붙 제거).

**구현 내역:**
- `createLecture/app/api/cqi.py` — `GET /api/cqi-reports`, `GET /api/cqi-reports/{id}` 추가
- `createLecture/web/index.html` — "📊 학습 분석에서 직접 가져오기" 모달
- `analyzeLecture/web/report.html` — "➜ 강의 제작에 적용" 버튼
- 딥링크: `?cqi_report_id=xxx` 으로 자동 로드
- 결과: 5단계 수동 → 1클릭

---

### 2. playLecture 재생 행동 텔레메트리 ✅ *(2026-05-25 완료)*

CQI 분석 품질의 가장 큰 ROI. seek/pause/replay/speed_change 이벤트 수집 → 어디서 막혔는지 정량 파악.

**구현 내역:**
- `playLecture/app/models.py` — `PlaybackEvent` 테이블 추가 (lecture_id, user_id, slide_idx, seg_idx, event_type, position_ms, payload, created_at)
- `playLecture/app/schemas.py` — `PlaybackEventIn`, `PlaybackEventBatchIn` 검증 (event_type whitelist)
- `playLecture/app/api/playback.py` — `POST /api/playback-event` (배치 수신, sendBeacon 호환 raw body 파싱)
- `playLecture/app/api/admin.py` — Analytics API에 `playback_stats` 필드 추가 + cascade delete 포함
- `playLecture/web/player.html` — 속도 selector (#speed-select) 추가
- `playLecture/web/js/player.js` — `Telemetry` 모듈: 3초 디바운스 버퍼 + beforeunload sendBeacon 플러시
  - `seek_back/seek_forward`: HTML5 `seeked` 이벤트 + 2초 이상 점프
  - `pause`: btn-play 클릭에서만 (자동 종료/세그먼트 전환 억제)
  - `replay`: 후반(50%↑) → 0초(1s↓) 점프 패턴 인식
  - `speed_change`: `ratechange` 이벤트
- `analyzeLecture/app/api/analyze.py` — Claude 프롬프트에 재생 행동 시그널 + confusion 가이드 추가
- 검증: 실제 player.html에서 pause·seek·replay·speed 발생 → DB 저장 → analytics API 노출 확인 완료
- **report.html 시각화 추가** *(2026-05-25)* — 슬라이드 카드에 행동 시그널 패널 (⏸ ⏪ ↻ ⏩ ⚙ + 시맨틱 색상)
  - `analyzeLecture/web/js/report.js` — `playbackStatsHtml()` 위젯 함수
  - `analyzeLecture/web/css/analyze.css` — `.pb-cell` 시그널별 색상 (neutral/info/warning/alert/subtle/zero)

---

### 3. 퀴즈·체크포인트 구현 ✅ *(2026-05-26 완료)*

**목표:** A5/A6 단계 명시된 미구현. 모든 CQI 분석의 정확도 향상.

**Phase A — 데이터 레이어 ✅** *(2026-05-26 완료)*
- `playLecture/app/models.py` — `QuizResponse` 테이블 (user_id+lecture_id+slide_idx PK, answer_index, is_correct, answered_at)
- `playLecture/app/api/quiz.py` — `GET/POST /api/quiz/{lecture_id}/{slide_idx}`
  - GET: 퀴즈 본문(정답 제외) + 내 응답 + 누적 통계 (총 응답 수, 정답률, 옵션 분포)
  - POST: 응답 저장(재제출시 갱신) → 정답·해설 공개
- `playLecture/app/api/admin.py` — cascade-delete에 QuizResponse 추가
- `createLecture/app/services/lecture_builder.py` — `_normalize_quiz()` 헬퍼 + `slide_out`에 quiz 보존
  - 유효성 검증: type=mcq, 옵션 ≥2개, 빈 옵션 거부, correct_index 범위
- `createLecture/app/api/scripts.py` — GET/PUT 모두 quiz 필드 보존
- 검증: 7가지 케이스(인증·존재·정답·오답·재제출·범위·통계) 통과

**Phase B — 저작 UI ✅** *(2026-05-26 완료)*
- `createLecture/app/services/quiz_generator.py` — Claude로 4지선다 초안 생성 (`type/question/options/correct_index/explanation` 정합성 검사 포함)
- `createLecture/app/api/scripts.py` — `POST /api/lectures/{id}/slides/{slide_idx}/quiz/generate`
- `createLecture/web/scripts.html` + `web/css/scripts.css?v=2` — 체크포인트 퀴즈 섹션 스타일
- `createLecture/web/js/scripts.js?v=8` — `renderQuizSection()`, `captureQuizFromDom()`, `onGenerateQuiz()`
  - 토글 켜기/끄기 → quiz 필드 추가/제거
  - 슬라이드 이동시 입력값 보존 (saveCurrentToState 통합)
  - AI 자동 생성: 현재 슬라이드 스크립트·키워드를 컨텍스트로 4지선다 초안 채움
- 검증 8건 통과 (초기 상태·토글·수동 입력·슬라이드 이동 후 복원·AI 생성·토글 끄기·리로드 cleanup)

**Phase C — 응시 UI ✅** *(2026-05-26 완료)*
- `playLecture/web/player.html` + `web/css/player.css?v=3` — `#quiz-modal` 마크업/스타일
- `playLecture/web/js/player.js?v=9` — `QuizModal` IIFE (open/submit/skip/next)
  - `advance()`에서 마지막 세그먼트 종료 시 `slide.quiz` 있으면 모달 표시
  - 응답 → `POST /api/quiz/{lecture_id}/{slide_idx}` → 정답 행 ✓, 오답 행 ✗, 해설 노출 → "다음 슬라이드 ▶"
  - 건너뛰기 가능 (응답 안 함, 다음 슬라이드로 진행)
  - `answeredSlides` Set으로 같은 슬라이드 재방문 시 모달 재표시 방지
- 검증: 모달 자동 표시 / 정답·오답 색상 분기 / 해설 노출 / DB 저장 (slide_idx=0 정답, slide_idx=1 오답) / 답변 후 재방문 모달 미표시

**Phase D — 분석 통합 ✅** *(2026-05-26 완료)*
- `playLecture/app/api/admin.py` — Analytics API에 `quiz_stats` 필드 (total_responses, correct_count, accuracy, option_distribution, correct_index) 추가. lecture.json에서 옵션 개수·정답 인덱스를 함께 읽어 분포 배열 정합 보장.
- `analyzeLecture/app/api/analyze.py` — `_build_prompt`에 "체크포인트 퀴즈: 응답 N명, 정답률 N%" + 옵션별 분포 라인 추가. confusion 가이드에 정답률 임계값(<0.5/0.5–0.75/≥0.75)·오답 집중 신호 가이드 추가. 보고서 JSON 병합 시 `quiz_stats` 보존.
- `analyzeLecture/web/js/report.js?v=5` — `quizStatsHtml()` 위젯. 정답률 뱃지(low/mid/high 색상)·옵션별 막대(정답 행 녹색).
- `analyzeLecture/web/css/analyze.css?v=5` — `.qz-stats-wrap`, `.qz-bar`, 색상 클래스
- 검증: 실제 Claude 분석 1회 — slide 0(63% mid) confusion=0.62, slide 2(25% low) confusion=0.88. CQI 지시문이 "정답률 25%로 이해도가 매우 낮습니다" + "오답이 옵션1·3에 집중된 점을 고려해" 라고 명시적으로 quiz 시그널을 인용 — 의도대로 동작.

### 🎯 Phase 3 (퀴즈·체크포인트) 종료 — 4단계 모두 완료

**전체 사이클이 닫힘:**
1. createLecture에서 슬라이드별 4지선다 퀴즈 작성 (AI 자동 생성 + 수동 수정)
2. playLecture에서 학생이 슬라이드 끝마다 모달로 응시 (정답·해설 즉시 노출)
3. 응답 데이터가 analytics API → analyzeLecture로 흘러감
4. Claude가 정답률·오답 분포를 confusion 시그널로 활용해 CQI 지시문에 직접 인용
5. 교수자가 report.html에서 퀴즈 위젯(정답률 뱃지·옵션 분포 막대)으로 결과 확인

**예상 작업량:** Phase B+C+D 합쳐 2~3 세션 추가

---

### 4. 인증 일관화 + path traversal 방어 ⏳

**목표:** 운영 노출 전 필수 (3개 서비스 공통).

**범위:**
- 공통 모듈 또는 환경변수로 admin 토큰 통합
- createLecture: 모든 변경 API에 인증 미들웨어
- playLecture: 세션 `expires_at` + 만료 검사, `prof_` 접두사 권한 → 명시적 role 필드
- playLecture admin.py:40 `/tmp/{filename}` → `tempfile.NamedTemporaryFile()` 또는 검증된 경로
- 모든 서비스: `lecture_id` UUID 형식 검증 후 파일 경로 조합
- 옵션: 운영 시 reverse proxy + Basic Auth 통일

**예상 작업량:** 중

---

### 5. 회차 비교 뷰 + Claude 스키마 강제 ⏳

**목표:** analyzeLecture가 "단발 분석 도구"가 아닌 "지속 개선 추적 도구"로 진화.

**범위:**
- **스키마 강제 (tool-use):**
  - Anthropic `tools=[{...}]`로 CQI 출력을 함수 호출로 강제
  - 0~1 범위, action enum, 필드 필수 여부 자동 검증
  - 파싱 실패 시 재시도 + 지수 백오프
- **회차 비교 뷰:**
  - 같은 course+week의 보고서들 시계열 정렬
  - 슬라이드별 confusion_score 추이 그래프 (▲▼)
  - 개선·악화 슬라이드 자동 강조

**예상 작업량:** 중

---

## 📌 진행 규칙

1. 항목 하나씩 진행, 완료 시 `[ ]` → `[x]` + `*(YYYY-MM-DD 완료)*` 표기.
2. 핵심 변경 파일·엔드포인트는 해당 항목 본문에 기록.
3. 신규 기능은 verify(실행해서 화면 확인) 후 완료 처리.
4. 다음 진행 항목은 `#2 재생 행동 텔레메트리` 부터 권장 (가장 큰 CQI 품질 ROI).
