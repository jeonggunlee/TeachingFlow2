from fastapi import Depends, Header, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Lecture, Session, User


async def require_slide(db: AsyncSession, lecture_id: str, slide_idx: int) -> Lecture:
    """수강 데이터를 쓰기 전에 (강의, 슬라이드 번호)가 실재하는지 확인한다.

    범위 밖 slide_idx를 그대로 저장하면 `/admin/analytics`가
    0..slide_count-1 범위만 돌려주므로 그 데이터는 분석에서 통째로 사라진다.
    조용한 유실 대신 즉시 거절한다.
    """
    lecture = await db.get(Lecture, lecture_id)
    if not lecture:
        raise HTTPException(404, "강의를 찾을 수 없습니다.")
    if not (0 <= slide_idx < lecture.slide_count):
        raise HTTPException(
            404,
            f"슬라이드 번호가 범위를 벗어났습니다 (0~{max(lecture.slide_count - 1, 0)}).",
        )
    return lecture


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
