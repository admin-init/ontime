"""FastAPI 装配：建库、媒体文件、API 路由、前端构建产物托管。

开发期前端跑在 vite（5173），通过代理访问 /api；
打包演示时把 frontend/dist 放到仓库里，这里直接托管并回落到 index.html。
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import update

from app.api import router
from app.core import MEDIA_DIR, REPO_DIR, SessionLocal, init_db
from app.models import Job

DIST_DIR = REPO_DIR / "frontend" / "dist"
DEV_ORIGINS = [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
]


def _recover_interrupted_jobs() -> None:
    """进程重启后，内存里的任务已丢失：把遗留的 queued/running 标成失败，避免前端永远转圈。"""
    with SessionLocal() as db:
        db.execute(
            update(Job)
            .where(Job.state.in_(("queued", "running")))
            .values(state="failed", last_error="服务重启，任务已中断，请重新上传")
        )
        db.commit()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    _recover_interrupted_jobs()
    from app.scheduler import shutdown_scheduler, start_scheduler

    start_scheduler()
    try:
        yield
    finally:
        shutdown_scheduler()


app = FastAPI(title="到点 · ontime", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=DEV_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MEDIA_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=MEDIA_DIR), name="media")

app.include_router(router)


if DIST_DIR.is_dir():
    # 静态资源（vite 产物）走独立挂载，其余路径回落到 index.html，交给前端路由
    if (DIST_DIR / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str):
        if path:
            target = (DIST_DIR / path).resolve()
            if target.is_file() and target.is_relative_to(DIST_DIR.resolve()):
                return FileResponse(target)
        return FileResponse(DIST_DIR / "index.html")
