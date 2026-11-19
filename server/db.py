"""SQLAlchemy engine/session. DATABASE_URL unset -> `engine` is None (lab mode: ingest works, nothing is persisted)."""
from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from settings import get_settings

_url = get_settings().database_url
engine = create_engine(_url, pool_pre_ping=True, connect_args={"connect_timeout": 5}) if _url else None
SessionLocal = sessionmaker(engine, expire_on_commit=False) if engine else None


def get_db() -> Iterator[Session]:
    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL is not set")
    with SessionLocal() as s:
        yield s
