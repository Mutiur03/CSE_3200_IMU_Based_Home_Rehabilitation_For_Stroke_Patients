"""FastAPI entry point: `uvicorn main:app`. Device ingest lives in ingest.py; platform APIs in routers/."""
from pathlib import Path

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.exc import DataError
from fastapi.staticfiles import StaticFiles

import ingest
from routers import ROUTERS

app = FastAPI(title="IMU Rehab Platform")
app.include_router(ingest.router)
for r in ROUTERS:
    app.include_router(r)



@app.exception_handler(RequestValidationError)
async def invalid_body(_, exc):
    """Default handler echoes the offending input, which is a 500 when it is Infinity/NaN; leave the input out."""
    return JSONResponse({"detail": [{k: v for k, v in e.items() if k not in ("input", "ctx")} for e in exc.errors()]}, status_code=422)


@app.exception_handler(DataError)
async def bad_data(_, __):
    """Values Postgres refuses (NUL bytes in text, integers out of range) are the client's fault, not a 500."""
    return JSONResponse({"detail": "invalid value"}, status_code=422)


_dash = Path(__file__).parent / "dashboard.html"


@app.get("/lab")
@app.get("/")  # standalone lab mode; behind Caddy "/" is the Next.js app
def dashboard():
    return FileResponse(_dash)


# Web build of the game (Godot export into server/web/), same origin: /play/
WEB_DIR = Path(__file__).parent / "web"
if WEB_DIR.is_dir():
    app.mount("/play", StaticFiles(directory=WEB_DIR, html=True), name="play")

if __name__ == "__main__":
    import os

    import uvicorn

    # 0.0.0.0 so the ESP32 can reach it on the LAN. Reload is opt-in (IMU_RELOAD=1): a restart mid-session drops the ESP32 link.
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=os.environ.get("IMU_RELOAD") == "1")
