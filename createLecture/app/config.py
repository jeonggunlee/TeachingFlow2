from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    anthropic_api_key: str = ""
    claude_model: str = "claude-sonnet-4-6"
    tts_voice: str = "ko-KR-InJoonNeural"
    storage_root: Path = Path("./storage")
    max_upload_mb: int = 80
    analyzelecture_url: str = "http://localhost:8002"


settings = Settings()
