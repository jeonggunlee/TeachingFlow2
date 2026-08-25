from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from .config import CREATELECTURE_STORAGE_ROOT, STORAGE_ROOT
from .database import init_db
from .api import admin, auth, chat, difficulty, lectures, playback, progress, quiz, settings

LECTURES_DIR = STORAGE_ROOT / "lectures"
LECTURES_DIR.mkdir(parents=True, exist_ok=True)

WEB = Path(__file__).parent.parent / "web"

NO_CACHE = {"Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(lifespan=lifespan)

app.include_router(admin.router)
app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(difficulty.router)
app.include_router(lectures.router)
app.include_router(playback.router)
app.include_router(progress.router)
app.include_router(quiz.router)
app.include_router(settings.router)

CL_LECTURES_DIR = CREATELECTURE_STORAGE_ROOT / "lectures"


@app.get("/static/{lecture_id}/{path:path}")
async def serve_lecture_static(lecture_id: str, path: str):
    """playLecture 저장소 우선, 없으면 createLecture 저장소에서 서빙."""
    local = LECTURES_DIR / lecture_id / path
    if local.exists() and local.is_file():
        return FileResponse(str(local))
    cl = CL_LECTURES_DIR / lecture_id / path
    if cl.exists() and cl.is_file():
        return FileResponse(str(cl))
    raise HTTPException(404, "파일을 찾을 수 없습니다.")

@app.get("/css/{filename}")
async def css_file(filename: str):
    path = WEB / "css" / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404)
    return FileResponse(str(path), headers=NO_CACHE, media_type="text/css")


@app.get("/js/{filename}")
async def js_file(filename: str):
    path = WEB / "js" / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404)
    return FileResponse(str(path), headers=NO_CACHE)


@app.get("/", response_class=HTMLResponse)
async def index():
    return """<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><title>HALLYM EDUTECH — 강의 운영</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#0f172a; color:#e2e8f0; font-family:-apple-system, "Noto Sans KR", sans-serif; }
  .box { max-width:520px; padding:48px 36px; background:#1e293b; border-radius:12px;
         border:1px solid #334155; text-align:center; }
  h1 { margin:0 0 12px; font-size:22px; }
  p { margin:8px 0; color:#94a3b8; line-height:1.6; font-size:14px; }
  a { display:inline-block; margin-top:24px; padding:10px 24px; background:#38bdf8;
      color:#0f172a; border-radius:8px; text-decoration:none; font-weight:600; }
  a:hover { background:#0ea5e9; color:#fff; }
</style></head>
<body><div class="box">
  <h1>📚 강의 운영 서비스</h1>
  <p>이 서비스는 강의 포털을 통해 접근합니다.</p>
  <p>교수자·관리자는 포털에서 강의 운영을 시작하세요.</p>
  <a id="portal-link" href="http://localhost:8003">강의 포털로 이동 →</a>
</div>
<script>document.getElementById('portal-link').href = location.protocol + '//' + location.hostname + ':8003';</script>
</body></html>"""


@app.get("/player")
async def player():
    return FileResponse(str(WEB / "player.html"), headers=NO_CACHE)


@app.get("/login")
async def login_page():
    return FileResponse(str(WEB / "login.html"), headers=NO_CACHE)


@app.get("/register")
async def register_page():
    return FileResponse(str(WEB / "register.html"), headers=NO_CACHE)


@app.get("/admin")
async def admin_page():
    return FileResponse(str(WEB / "admin.html"), headers=NO_CACHE)
