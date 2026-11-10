import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_API_KEY          = os.getenv("ANTHROPIC_API_KEY", "")
PLAYLECTURE_URL            = os.getenv("PLAYLECTURE_URL", "http://localhost:8001")
PLAYLECTURE_ADMIN_PASSWORD = os.getenv("PLAYLECTURE_ADMIN_PASSWORD", "")   # 기본값 없음 — 아래에서 검사
CREATELECTURE_URL          = os.getenv("CREATELECTURE_URL", "http://localhost:8000")
STORAGE_ROOT               = Path("storage")
DB_URL                     = f"sqlite+aiosqlite:///{STORAGE_ROOT / 'db.sqlite3'}"
CLAUDE_MODEL               = "claude-sonnet-4-6"

_WEAK_PASSWORDS = {"", "changeme", "admin", "password", "1234", "12345678"}
if PLAYLECTURE_ADMIN_PASSWORD.strip() in _WEAK_PASSWORDS:
    raise RuntimeError(
        "PLAYLECTURE_ADMIN_PASSWORD 가 .env 에 없거나 기본값입니다. 네 서비스가 공유하는 강한 비밀번호를 설정하세요 "
        "(예: python -c 'import secrets; print(secrets.token_urlsafe(24))')."
    )
