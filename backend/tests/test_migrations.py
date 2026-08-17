"""Acceptance test for the M1 migration: `alembic upgrade head` builds the three
tables on a fresh DB and `downgrade` reverses cleanly (issue #34).

Alembic is driven through an injected connection (see alembic/env.py) inside a
transaction that is rolled back, so the round-trip runs against a real, empty schema
without touching the shared test database or requiring CREATEDB.
"""

from pathlib import Path

from alembic.config import Config
from sqlalchemy import inspect, text

from alembic import command
from app.db import engine
from app.models import Base

M1_TABLES = {"sound", "tag", "sound_tags"}

_ALEMBIC_INI = Path(__file__).resolve().parent.parent / "alembic.ini"


def _alembic_config(connection: object) -> Config:
    cfg = Config(str(_ALEMBIC_INI))
    cfg.attributes["connection"] = connection
    return cfg


def test_m1_migration_round_trips() -> None:
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            # Start from a truly empty schema so `upgrade` runs like a fresh DB:
            # drop the models' tables and any prior Alembic version stamp.
            Base.metadata.drop_all(bind=connection)
            connection.execute(text("DROP TABLE IF EXISTS alembic_version"))
            cfg = _alembic_config(connection)

            command.upgrade(cfg, "head")
            tables_after_upgrade = set(inspect(connection).get_table_names())
            assert M1_TABLES <= tables_after_upgrade

            command.downgrade(cfg, "base")
            tables_after_downgrade = set(inspect(connection).get_table_names())
            assert M1_TABLES.isdisjoint(tables_after_downgrade)
        finally:
            transaction.rollback()
