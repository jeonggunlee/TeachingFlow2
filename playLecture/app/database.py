from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import declarative_base, sessionmaker
from .config import DB_URL

engine = create_async_engine(DB_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()


async def _migrate(conn):
    """create_all이 처리하지 못하는 기존 테이블의 컬럼 추가(경량 마이그레이션)."""
    rows = await conn.exec_driver_sql("PRAGMA table_info(chat_messages)")
    cols = {r[1] for r in rows.fetchall()}
    if "origin" not in cols:
        await conn.exec_driver_sql(
            "ALTER TABLE chat_messages ADD COLUMN origin TEXT NOT NULL DEFAULT 'student'"
        )


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _migrate(conn)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
