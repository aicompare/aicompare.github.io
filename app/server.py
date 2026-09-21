"""FastAPI server: JSON API + static pages with clean URLs.

Run:  uvicorn app.server:app --host 0.0.0.0 --port 8000
"""
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from scraper import db

STATIC = Path(__file__).resolve().parent.parent / "static"

app = FastAPI(title="ModelRadar", version="2.0.0")


@app.get("/api/models")
@app.get("/api/models.json")
def list_models():
    conn = db.connect()
    try:
        return db.get_models(conn)
    finally:
        conn.close()


@app.get("/api/status")
@app.get("/api/status.json")
def status():
    conn = db.connect()
    try:
        return db.get_last_runs(conn)
    finally:
        conn.close()


PAGES = ["models", "compare", "pricing", "about"]


@app.get("/")
def home():
    return FileResponse(STATIC / "index.html")


for _page in PAGES:
    def _make(page: str):
        def view():
            return FileResponse(STATIC / f"{page}.html")
        return view

    app.get(f"/{_page}")(_make(_page))


app.mount("/", StaticFiles(directory=STATIC, html=True), name="static")
