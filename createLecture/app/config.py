from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    anthropic_api_key: str = ""
    claude_model: str = "claude-sonnet-4-6"
    tts_voice: str = "ko-KR-InJoonNeural"
    storage_root: Path = Path("./storage")
    analyzelecture_url: str = "http://localhost:8002"
    # 포털·playLecture·analyzeLecture와 같은 값이어야 포털 로그인 토큰이 여기서도 통한다.
    admin_password: str = ""


settings = Settings()

_WEAK_PASSWORDS = {"", "changeme", "admin", "password", "1234", "12345678"}
if settings.admin_password.strip() in _WEAK_PASSWORDS:
    raise RuntimeError(
        "ADMIN_PASSWORD 가 .env 에 없거나 기본값입니다. 네 서비스가 공유하는 강한 비밀번호를 설정하세요 "
        "(예: python -c 'import secrets; print(secrets.token_urlsafe(24))')."
    )
