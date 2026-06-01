# TeachingFlow — AI 강의 제작·운영·분석 시스템

> PPT를 입력하면 AI가 슬라이드별 스크립트와 음성을 생성하고, 수강생의 학습 데이터를 수집·분석해 다음 학기 강의 개선(CQI)으로 자동 환류하는 4-서비스 FastAPI 플랫폼.

---

## 개요

**TeachingFlow**는 강의의 한 사이클 — **제작 → 운영 → 분석 → 개선** — 을 한 시스템에서 다룹니다. 4개의 독립 FastAPI 서비스로 구성되며, 모든 흐름은 포털에서 시작됩니다.

- **AI 기반 자동 제작**: Claude Vision으로 슬라이드 분석 + Edge TTS로 한국어 음성 합성
- **학습 데이터 수집**: 슬라이드별 난이도 평가·질문·키워드·진도율을 자동 집계
- **CQI 환류**: Claude API로 혼란도 지수 산출 → 미이해 개념 추출 → 다음 학기 스크립트에 자동 반영

---

## 시스템 구성

| 서비스 | 포트 | 역할 | 상세 |
|---|---|---|---|
| **portal** | 8003 | 과목·주차 관리, 전체 흐름 진입점 | [portal/CLAUDE.md](portal/CLAUDE.md) |
| **createLecture** | 8000 | PPT → AI 스크립트 → TTS → 강의 파일 생성 | [createLecture/CLAUDE.md](createLecture/CLAUDE.md) |
| **playLecture** | 8001 | 수강생 강의 재생, 학습 데이터 수집 | [playLecture/CLAUDE.md](playLecture/CLAUDE.md) |
| **analyzeLecture** | 8002 | 혼란도 분석 → CQI 보고서 생성 | [analyzeLecture/CLAUDE.md](analyzeLecture/CLAUDE.md) |

---

## 전체 흐름

```
[교수자]
   │
   ├─ portal (8003)           ← 시작점: 과목·주차 관리
   │
   ├─ createLecture (8000)    ← PPT 업로드 → Claude Vision 분석 → TTS
   │   ※ CQI 모드: 이전 학기 수강생 피드백으로 스크립트 자동 보강
   │
   ├─ playLecture (8001)      ← 수강생 강의 재생
   │   수집: 슬라이드별 난이도 / 질문 / 키워드 / 진도율
   │
   ▼
[Analytics API]
   │
   └─ analyzeLecture (8002)   ← Claude 분석 → 슬라이드별 혼란도 지수
       │
       └─ CQI 보고서 ────► createLecture로 환류 ↻ (다음 학기 개선)
```

---

## 빠른 시작

각 서비스를 별도 터미널에서 실행합니다.

### 1. 사전 준비

```bash
# createLecture 의존성 (1회)
sudo apt-get install -y libreoffice poppler-utils fonts-noto-cjk
```

### 2. 4개 서비스 실행

```bash
# portal — 포트 8003 (시작점)
cd portal && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 8003 --reload

# createLecture — 포트 8000
cd createLecture && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # ANTHROPIC_API_KEY 입력
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# playLecture — 포트 8001
cd playLecture && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # ADMIN_PASSWORD, SECRET_KEY,
                            # CREATELECTURE_STORAGE_ROOT 입력
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload

# analyzeLecture — 포트 8002
cd analyzeLecture && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # ANTHROPIC_API_KEY, PLAYLECTURE_URL 등 입력
uvicorn app.main:app --host 0.0.0.0 --port 8002 --reload
```

### 3. 접속

브라우저에서 **http://localhost:8003** 으로 진입하세요. 모든 흐름은 포털에서 시작합니다.

---

## 디렉터리 구조

```
TeachingFlow/
├── CLAUDE.md                  # 전체 아키텍처 개요
├── README.md
├── portal/                    # 과목·주차 포털 (포트 8003)
├── createLecture/             # 강의 제작 (포트 8000)
├── playLecture/               # 강의 운영 (포트 8001)
└── analyzeLecture/            # 학습 분석 (포트 8002)
```

각 서브시스템은 자체 `CLAUDE.md` / `app/` / `web/` / `storage/` 구조를 갖습니다.

---

## 기술 스택

| 영역 | 사용 기술 |
|---|---|
| Backend | FastAPI + uvicorn + SQLAlchemy async + SQLite |
| AI 분석 | Claude API (`claude-sonnet-4-6`, Vision 포함) |
| TTS | Edge TTS (`ko-KR-InJoonNeural`) |
| PPT 변환 | LibreOffice (headless) + pdf2image |
| Frontend | 바닐라 HTML/CSS/JavaScript (프레임워크 없음) |
| 실시간 진행 | Server-Sent Events (SSE) |
| 키워드 추출 | 한국어 조사·어미 최장 일치 + 영어 정규화 |

---

## 서비스 간 연동

| From → To | 방식 |
|---|---|
| createLecture → playLecture | 파일시스템 직접 공유 (`CREATELECTURE_STORAGE_ROOT`) — ZIP 없이 즉시 서비스 |
| playLecture → analyzeLecture | Analytics API — `GET /admin/analytics/{lecture_id}` (HTTP Basic) |
| analyzeLecture → createLecture | CQI 보고서 JSON → 스크립트 보강 입력 |
| portal → 각 서비스 | 상태 프로브 + 주차별 분석 트리거 프록시 |

---

## 상세 문서

- 전체 아키텍처: [`CLAUDE.md`](CLAUDE.md)
- 서브시스템별 상세 — 각 디렉터리의 `CLAUDE.md`:
  - [portal/CLAUDE.md](portal/CLAUDE.md)
  - [createLecture/CLAUDE.md](createLecture/CLAUDE.md)
  - [playLecture/CLAUDE.md](playLecture/CLAUDE.md)
  - [analyzeLecture/CLAUDE.md](analyzeLecture/CLAUDE.md)
- ZIP 강의 포맷: [playLecture/LECTURE_EXPORT_FORMAT.md](playLecture/LECTURE_EXPORT_FORMAT.md)

---

## 주의 사항

- 기본 구성은 **plain HTTP**입니다. 외부 공개 시에는 nginx 등으로 HTTPS 종단을 별도로 배치하세요.
- 모든 `.env` 파일은 API 키와 관리자 비밀번호를 포함하며 `.gitignore`로 제외되어 있습니다. 배포 환경에서 직접 작성해야 합니다.
- 현재는 **슬라이드 + TTS 음성** 형식의 강의만 지원합니다. 사전 녹화 동영상(MP4) 재생은 아직 지원하지 않습니다.
- 4-서비스 구성으로 분리되어 있으므로, 로컬 개발 시 4개의 터미널 또는 프로세스 관리 도구(systemd, pm2 등)가 필요합니다.

---

## 저작자

이정근 (jeonggun.lee@gmail.com)
