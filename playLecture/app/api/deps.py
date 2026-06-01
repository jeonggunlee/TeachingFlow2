from fastapi import Depends, Header, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Session, User


async def get_current_user(
    authorization: str = Header(None),
    token: str = Query(None),   # sendBeacon fallback (beforeunload)
    db: AsyncSession = Depends(get_db),
) -> User:
    # Bearer 헤더 우선, 없으면 쿼리 파라미터 token 사용 (sendBeacon 대응)
    raw_token = None
    if authorization and authorization.startswith("Bearer "):
        raw_token = authorization[7:]
    elif token:
        raw_token = token

    if not raw_token:
        raise HTTPException(401, "로그인이 필요합니다.", headers={"WWW-Authenticate": "Bearer"})

    result = await db.execute(select(Session).where(Session.token == raw_token))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(401, "유효하지 않은 세션입니다.", headers={"WWW-Authenticate": "Bearer"})

    user = await db.get(User, session.user_id)
    if not user:
        raise HTTPException(401, "사용자를 찾을 수 없습니다.", headers={"WWW-Authenticate": "Bearer"})

    return user
