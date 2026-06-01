import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Session, User
from ..schemas import LoginIn, RegisterIn
from .deps import get_current_user

router  = APIRouter(prefix="/api/auth")
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


@router.post("/register")
async def register(body: RegisterIn, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == body.username))
    if result.scalar_one_or_none():
        raise HTTPException(409, "이미 사용 중인 아이디입니다.")

    user = User(
        username=body.username,
        display_name=body.display_name,
        password_hash=pwd_ctx.hash(body.password),
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"ok": True, "user_id": user.id}


@router.post("/login")
async def login(body: LoginIn, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()
    if not user or not pwd_ctx.verify(body.password, user.password_hash):
        raise HTTPException(401, "아이디 또는 비밀번호가 틀렸습니다.")

    token = secrets.token_urlsafe(32)
    db.add(Session(token=token, user_id=user.id,
                   created_at=datetime.now(timezone.utc).isoformat()))
    await db.commit()
    return {
        "token": token,
        "user": {"id": user.id, "username": user.username, "display_name": user.display_name},
    }


@router.post("/logout")
async def logout(authorization: str = Header(None), db: AsyncSession = Depends(get_db)):
    if not authorization or not authorization.startswith("Bearer "):
        return {"ok": True}
    token = authorization[7:]
    result = await db.execute(select(Session).where(Session.token == token))
    session = result.scalar_one_or_none()
    if session:
        await db.delete(session)
        await db.commit()
    return {"ok": True}


@router.get("/me")
async def me(user: User = Depends(get_current_user)):
    return {"id": user.id, "username": user.username, "display_name": user.display_name}
