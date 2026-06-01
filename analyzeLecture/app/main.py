from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from .database import init_db
from .api.analyze import router

WEB = Path(__file__).parent.parent / "web"

NO_CACHE = {"Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache"}

app = FastAPI(title="analyzeLecture")


@app.on_event("startup")
async def startup():
    from .config import STORAGE_ROOT
    STORAGE_ROOT.mkdir(parents=True, exist_ok=True)
    await init_db()


app.include_router(router)

@app.get("/css/{filename}")
async def css_file(filename: str):
    path = WEB / "css" / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404)
    return FileResponse(path, headers=NO_CACHE, media_type="text/css")


@app.get("/js/{filename}")
async def js_file(filename: str):
    path = WEB / "js" / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404)
    return FileResponse(path, headers=NO_CACHE)


@app.get("/")
async def index():
    return RedirectResponse(url="/week-analyze", status_code=302)


@app.get("/report")
async def report():
    return FileResponse(WEB / "report.html", headers=NO_CACHE)


@app.get("/week-analyze")
async def week_analyze():
    return FileResponse(WEB / "week-analyze.html", headers=NO_CACHE)
