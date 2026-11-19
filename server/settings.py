"""Platform config from env / .env. Ingest-specific knobs (IMU_*, GAME_*, LOAD_SCALE) are still read in ingest.py."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=Path(__file__).parent / ".env", extra="ignore")

    database_url: str | None = None  # postgresql+psycopg://user:pass@host/db ; unset = lab mode (no persistence)
    jwt_secret: str = "dev-only-change-me-use-32-bytes-minimum"  # MUST be overridden outside local dev
    jwt_ttl_hours: int = 12
    cookie_secure: bool = False  # True behind HTTPS
    cookie_name: str = "session"
    imu_reload: bool = False  # IMU_RELOAD=1 in .env: auto-restart on code change (drops the ESP32 link; the wristband reconnects by itself)


@lru_cache
def get_settings() -> Settings:
    return Settings()
