from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .database import Base, engine
from .api.courses import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(title="EDUTECH Portal", lifespan=lifespan)
app.include_router(router)

WEB = Path(__file__).parent.parent / "web"
app.mount("/", StaticFiles(directory=WEB, html=True), name="static")
