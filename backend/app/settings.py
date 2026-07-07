"""Application configuration, sourced entirely from the environment.

A committed `.env.example` (consolidated in #7) lists every variable. No secrets at
launch — no auth, local-disk storage (ADR-0001, ADR-0002).
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-driven settings. Field names map to upper-case env vars."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # SQLAlchemy URL for the sync psycopg driver, e.g.
    # postgresql+psycopg://user:pass@localhost:5432/electrobard
    database_url: str = "postgresql+psycopg://electrobard:electrobard@localhost:5432/electrobard"

    # Root directory for the local-disk storage interface (save/get/delete by key).
    storage_root: str = "./var/storage"

    # Port the API listens on (used by the uvicorn fallback / compose).
    port: int = 8000


@lru_cache
def get_settings() -> Settings:
    """Return process-wide settings, cached so env parsing happens once."""
    return Settings()
