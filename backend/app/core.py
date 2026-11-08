from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import create_engine, event as sa_event
from sqlalchemy.orm import Session, sessionmaker

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent
STORAGE_DIR = REPO_DIR / "storage"
MEDIA_DIR = STORAGE_DIR / "media"


class Settings(BaseSettings):
    """本地配置。密钥不写进仓库：优先读环境变量，其次读 ~/.ontime/llm_key。"""

    model_config = SettingsConfigDict(env_file=str(BACKEND_DIR / ".env"), extra="ignore")

    llm_base_url: str = "https://api.deepseek.com/v1"
    llm_api_key: str = ""
    llm_model: str = "deepseek-flash"
    llm_timeout: float = 150.0

    school_name: str = "西南交通大学"
    college_name: str = "数学学院"
    school_domain: str = "swjtu.edu.cn"

    database_url: str = f"sqlite:///{(BACKEND_DIR / 'ontime.db').as_posix()}"
    demo_mode: bool = True

    @property
    def resolved_key(self) -> str:
        if self.llm_api_key:
            return self.llm_api_key
        key_file = Path.home() / ".ontime" / "llm_key"
        if key_file.exists():
            return key_file.read_text(encoding="utf-8").strip()
        return ""


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

_engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
    future=True,
)


@sa_event.listens_for(_engine, "connect")
def _sqlite_pragma(dbapi_conn, _record):  # noqa: ANN001
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA foreign_keys=ON")
    cur.close()


SessionLocal = sessionmaker(bind=_engine, expire_on_commit=False, autoflush=False, future=True)


def init_db() -> None:
    from app import models  # noqa: F401  确保模型注册

    models.Base.metadata.create_all(_engine)
    for d in (STORAGE_DIR, MEDIA_DIR, MEDIA_DIR / "screenshots"):
        d.mkdir(parents=True, exist_ok=True)


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
