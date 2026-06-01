import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_API_KEY          = os.getenv("ANTHROPIC_API_KEY", "")
PLAYLECTURE_URL            = os.getenv("PLAYLECTURE_URL", "http://localhost:8001")
PLAYLECTURE_ADMIN_PASSWORD = os.getenv("PLAYLECTURE_ADMIN_PASSWORD", "changeme")
CREATELECTURE_URL          = os.getenv("CREATELECTURE_URL", "http://localhost:8000")
STORAGE_ROOT               = Path("storage")
DB_URL                     = f"sqlite+aiosqlite:///{STORAGE_ROOT / 'db.sqlite3'}"
CLAUDE_MODEL               = "claude-sonnet-4-6"
