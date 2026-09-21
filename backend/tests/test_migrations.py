"""Migration acceptance tests against a real, transactionally isolated Postgres."""

import uuid
from pathlib import Path

from alembic.config import Config
from sqlalchemy import inspect, text

from alembic import command
from app.db import engine
from app.models import Base

M1_TABLES = {"sound", "tag", "sound_tags"}
M2_TABLES = {"layer", "set", "set_tags"}

_ALEMBIC_INI = Path(__file__).resolve().parent.parent / "alembic.ini"


def _alembic_config(connection: object) -> Config:
    cfg = Config(str(_ALEMBIC_INI))
    cfg.attributes["connection"] = connection
    return cfg


def test_migrations_round_trip_and_backfill_existing_user() -> None:
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            Base.metadata.drop_all(bind=connection)
            connection.execute(text("DROP TABLE IF EXISTS alembic_version"))
            cfg = _alembic_config(connection)

            # Stop immediately before M2 so its existing-User backfill is exercised.
            command.upgrade(cfg, "0002_m1_sound_tag")
            existing_user_id = uuid.uuid4()
            connection.execute(
                text("INSERT INTO users (id) VALUES (:user_id)"),
                {"user_id": existing_user_id},
            )

            command.upgrade(cfg, "head")
            inspector = inspect(connection)
            assert M1_TABLES | M2_TABLES <= set(inspector.get_table_names())

            user_columns = {column["name"]: column for column in inspector.get_columns("users")}
            marker = user_columns["starter_layers_provisioned_at"]
            assert marker["nullable"] is True
            assert marker["default"] is None

            layer_columns = {column["name"]: column for column in inspector.get_columns("layer")}
            assert set(layer_columns) == {
                "id",
                "user_id",
                "name",
                "position",
                "playback_mode",
                "volume",
                "created_at",
            }
            set_columns = {column["name"]: column for column in inspector.get_columns("set")}
            assert set(set_columns) == {
                "id",
                "layer_id",
                "name",
                "position",
                "loop",
                "shuffle",
                "created_at",
            }

            assert {
                constraint["name"] for constraint in inspector.get_check_constraints("layer")
            } >= {
                "ck_layer_position_non_negative",
                "ck_layer_volume_range",
                "playback_mode",
            }
            assert {
                constraint["name"] for constraint in inspector.get_check_constraints("set")
            } >= {"ck_set_position_non_negative"}
            assert {
                constraint["name"] for constraint in inspector.get_unique_constraints("layer")
            } == {"uq_layer_user_position"}
            assert {
                constraint["name"] for constraint in inspector.get_unique_constraints("set")
            } == {"uq_set_layer_position"}

            for table in ("layer", "set", "set_tags"):
                for foreign_key in inspector.get_foreign_keys(table):
                    assert foreign_key["options"].get("ondelete") == "CASCADE"
            assert set(inspector.get_pk_constraint("set_tags")["constrained_columns"]) == {
                "set_id",
                "tag_id",
            }

            layers = [
                tuple(row)
                for row in connection.execute(
                    text(
                        "SELECT name, position, playback_mode, volume FROM layer "
                        "WHERE user_id = :user_id ORDER BY position"
                    ),
                    {"user_id": existing_user_id},
                )
            ]
            assert layers == [
                ("Music", 0, "single", 80),
                ("Ambience", 1, "multiset", 80),
                ("Sound Effects", 2, "self_stacking", 80),
            ]
            assert connection.scalar(
                text(
                    "SELECT starter_layers_provisioned_at IS NOT NULL "
                    "FROM users WHERE id = :user_id"
                ),
                {"user_id": existing_user_id},
            )

            command.downgrade(cfg, "0002_m1_sound_tag")
            downgraded_inspector = inspect(connection)
            assert M2_TABLES.isdisjoint(downgraded_inspector.get_table_names())
            assert "starter_layers_provisioned_at" not in {
                column["name"] for column in downgraded_inspector.get_columns("users")
            }

            command.downgrade(cfg, "base")
            assert M1_TABLES.isdisjoint(inspect(connection).get_table_names())
        finally:
            transaction.rollback()
