import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

STORAGE_ROOT   = Path(os.getenv("STORAGE_ROOT", "storage"))
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")   # 기본값 없음 — 아래에서 검사
DB_URL         = f"sqlite+aiosqlite:///{STORAGE_ROOT / 'db.sqlite3'}"

_WEAK_PASSWORDS = {"", "changeme", "admin", "password", "1234", "12345678"}
if ADMIN_PASSWORD.strip() in _WEAK_PASSWORDS:
    raise RuntimeError(
        "ADMIN_PASSWORD 가 .env 에 없거나 기본값입니다. 네 서비스가 공유하는 강한 비밀번호를 설정하세요 "
        "(예: python -c 'import secrets; print(secrets.token_urlsafe(24))')."
    )

# AI 교수 답변 · 자동 질문 생성용 Claude 설정
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL      = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6")

# createLecture 저장소 경로 (기본값: 같은 EDUTECH-3 루트 기준)
_default_cl = Path(__file__).parent.parent.parent / "createLecture" / "storage"
CREATELECTURE_STORAGE_ROOT = Path(os.getenv("CREATELECTURE_STORAGE_ROOT", str(_default_cl)))
