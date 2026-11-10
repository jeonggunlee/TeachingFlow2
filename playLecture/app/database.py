from sqlalchemy import event
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import declarative_base, sessionmaker
from .config import DB_URL

# 동시 수강 대비 설정.
# 기본값(pool 5 + overflow 10, 30초 대기, SQLite 저널 delete)으로는 가상 수강생 20명이
# 동시에 진도·난이도·채팅을 쓰는 순간 "QueuePool limit ... reached" 로 500 이 났다(2026-11-10 실측).
#  · WAL 저널: 읽기가 쓰기를 기다리지 않는다 → 채팅 조회·난이도 그래프 폴링이 쓰기와 겹쳐도 멈추지 않음
#  · busy_timeout: 쓰기끼리 겹치면 즉시 실패 대신 최대 10초 대기
#  · 풀 확대: 요청마다 커넥션 하나를 잡고 있으므로 동시 접속 수만큼 필요
engine = create_async_engine(
    DB_URL, echo=False,
    pool_size=30, max_overflow=30, pool_timeout=60,
    connect_args={"timeout": 10},
)


@event.listens_for(engine.sync_engine, "connect")
def _sqlite_pragmas(dbapi_conn, _record):
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA busy_timeout=10000")
    cur.execute("PRAGMA synchronous=NORMAL")   # WAL 에서 안전하고 fsync 비용은 절반
    cur.close()
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
