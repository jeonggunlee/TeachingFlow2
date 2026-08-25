from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

_NO_CACHE = {"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache"}

from app.api.cqi import router as cqi_router
from app.api.evolve import router as evolve_router
from app.api.jobs import router as jobs_router
from app.api.lectures import router as lectures_router
from app.api.scripts import router as scripts_router
from app.api.upload import router as upload_router
from app.config import settings

WEB_DIR = Path(__file__).resolve().parent.parent / "web"

app = FastAPI(title="HALLYM EDUTECH — Lecture Creation")

app.include_router(upload_router)
app.include_router(jobs_router)
app.include_router(lectures_router)
app.include_router(scripts_router)
app.include_router(cqi_router)
app.include_router(evolve_router)

(settings.storage_root / "lectures").mkdir(parents=True, exist_ok=True)
app.mount(
    "/static/lectures",
    StaticFiles(directory=settings.storage_root / "lectures"),
    name="lectures-static",
)

@app.get("/css/{filename}")
def css_file(filename: str) -> FileResponse:
    path = WEB_DIR / "css" / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404)
    return FileResponse(str(path), headers=_NO_CACHE, media_type="text/css")


@app.get("/js/{filename}")
def js_file(filename: str) -> FileResponse:
    path = WEB_DIR / "js" / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404)
    return FileResponse(str(path), headers=_NO_CACHE, media_type="application/javascript")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(WEB_DIR / "index.html", headers=_NO_CACHE)


@app.get("/player")
def player() -> FileResponse:
    return FileResponse(WEB_DIR / "player.html", headers=_NO_CACHE)


@app.get("/scripts")
def scripts_page() -> FileResponse:
    return FileResponse(WEB_DIR / "scripts.html", headers=_NO_CACHE)


@app.get("/week-lectures")
def week_lectures_page() -> FileResponse:
    return FileResponse(WEB_DIR / "week-lectures.html", headers=_NO_CACHE)


@app.get("/evolve")
def evolve_page() -> FileResponse:
    return FileResponse(WEB_DIR / "evolve.html", headers=_NO_CACHE)


@app.get("/healthz")
def healthz() -> dict:
    return {"ok": True}
