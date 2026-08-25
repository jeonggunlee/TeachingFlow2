from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from .config import DB_URL


class Base(DeclarativeBase):
    pass


engine = create_async_engine(DB_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# 같은 강의에 대해 "아직 끝나지 않은" 보고서는 하나만 존재하도록 DB가 보장한다.
# 애플리케이션에서 SELECT 후 INSERT 하는 방식은 동시 요청이 모두 INSERT 전에
# 조회를 마치면 그대로 통과해(TOCTOU) 같은 강의에 Claude 호출이 중복된다.
_UNIQUE_IN_FLIGHT = """
CREATE UNIQUE INDEX IF NOT EXISTS ux_cqi_reports_in_flight
ON cqi_reports (lecture_id)
WHERE status IN ('pending', 'processing')
"""


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        # 프로세스가 죽으면 BackgroundTask도 함께 사라진다. 그때 남은
        # pending/processing 행은 영원히 끝나지 않으면서 위 유니크 인덱스를
        # 점유해 그 강의의 재분석을 막는다 — 기동 시점에 실패로 정리한다.
        res = await conn.execute(text(
            "UPDATE cqi_reports SET status='error',"
            " error_message='서버 재시작으로 중단된 분석입니다. 다시 시도해주세요.'"
            " WHERE status IN ('pending','processing')"
        ))
        if res.rowcount:
            print(f"[analyzeLecture] 중단된 분석 {res.rowcount}건을 error로 정리했습니다.")

        # 정리 후에 인덱스를 만든다 (중복 in-flight 행이 남아 있으면 생성 실패)
        await conn.execute(text(_UNIQUE_IN_FLIGHT))


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
