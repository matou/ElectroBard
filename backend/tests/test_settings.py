"""Pure-unit test: settings parse from the environment. No I/O."""

import pytest

from app.settings import Settings


def test_settings_read_from_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://u:p@db:5432/eb")
    monkeypatch.setenv("STORAGE_ROOT", "/data/audio")
    monkeypatch.setenv("PORT", "9001")

    settings = Settings()

    assert settings.database_url == "postgresql+psycopg://u:p@db:5432/eb"
    assert settings.storage_root == "/data/audio"
    assert settings.port == 9001


def test_settings_have_sensible_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    for var in ("DATABASE_URL", "STORAGE_ROOT", "PORT"):
        monkeypatch.delenv(var, raising=False)

    # _env_file=None ignores any local .env so this asserts the coded defaults.
    settings = Settings(_env_file=None)  # type: ignore[call-arg]

    assert settings.port == 8000
    assert settings.database_url.startswith("postgresql+psycopg://")
