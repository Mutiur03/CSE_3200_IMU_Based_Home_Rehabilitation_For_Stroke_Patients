"""Platform config from env / .env. Ingest-specific knobs (IMU_*, GAME_*, LOAD_SCALE) are still read in ingest.py."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str | None = None  # postgresql+psycopg://user:pass@host/db ; unset = lab mode (no persistence)
    jwt_secret: str = "dev-only-change-me-use-32-bytes-minimum"  # MUST be overridden outside local dev
    jwt_ttl_hours: int = 12
    cookie_secure: bool = False  # True behind HTTPS
    cookie_name: str = "session"
    stub_mode: bool = True  # wave 0: routers return fixture data; streams A/B replace stubs and remove this


@lru_cache
def get_settings() -> Settings:
    return Settings()
