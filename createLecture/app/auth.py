"""관리자 인증 — 포털과 같은 비밀번호로 서명한 Bearer 토큰.

포털(portal/app/api/courses.py)이 발급한 토큰을 그대로 검증한다. 서명 키가
`portal-admin:{비밀번호}`로 동일하므로, 네 서비스의 관리자 비밀번호가 같으면
포털에서 한 번 로그인한 토큰으로 이 서비스의 변경 API도 호출할 수 있다.
포털을 거치지 않고 직접 접속한 경우를 위해 /api/auth/login 도 제공한다.

토큰 형식: `만료시각.난수.HMAC-SHA256`. 서버가 검증만 하므로 재시작해도 유지되고,
비밀번호를 바꾸면 기존 토큰이 한 번에 무효가 된다.
"""
import hashlib
import hmac
import secrets
import time
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.config import settings

TOKEN_TTL = 14 * 24 * 3600      # 2주

router = APIRouter(prefix="/api", tags=["auth"])


def _sign(payload: str) -> str:
    key = f"portal-admin:{settings.admin_password}".encode()
    return hmac.new(key, payload.encode(), hashlib.sha256).hexdigest()


def issue_token() -> str:
    payload = f"{int(time.time()) + TOKEN_TTL}.{secrets.token_urlsafe(12)}"
    return f"{payload}.{_sign(payload)}"


def valid_token(token: Optional[str]) -> bool:
    if not token:
        return False
    exp, _, rest = token.partition(".")
    nonce, _, sig = rest.partition(".")
    if not sig or not exp.isdigit() or int(exp) < time.time():
        return False
    return hmac.compare_digest(sig, _sign(f"{exp}.{nonce}"))


def require_admin(authorization: str = Header(None)) -> str:
    """강의 생성·수정·삭제·TTS 재합성·CQI 진화 등 변경 API에 붙이는 의존성."""
    token = authorization[7:] if authorization and authorization.startswith("Bearer ") else None
    if not valid_token(token):
        raise HTTPException(401, "관리자 로그인이 필요합니다.",
                            headers={"WWW-Authenticate": "Bearer"})
    return token


class LoginIn(BaseModel):
    password: str


@router.post("/auth/login")
async def admin_login(body: LoginIn):
    if not secrets.compare_digest(body.password, settings.admin_password):
        raise HTTPException(401, "비밀번호가 틀렸습니다")
    return {"ok": True, "token": issue_token()}
