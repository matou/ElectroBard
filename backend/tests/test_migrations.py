"""Migration acceptance tests against a real, transactionally isolated Postgres."""

import re
import uuid
from pathlib import Path

from alembic.config import Config
from sqlalchemy import Boolean, DateTime, Integer, String, Text, Uuid, inspect, text

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
            assert isinstance(marker["type"], DateTime)
            assert marker["type"].timezone is True
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
            assert isinstance(layer_columns["id"]["type"], Uuid)
            assert isinstance(layer_columns["user_id"]["type"], Uuid)
            assert isinstance(layer_columns["name"]["type"], Text)
            assert isinstance(layer_columns["position"]["type"], Integer)
            assert isinstance(layer_columns["playback_mode"]["type"], String)
            assert layer_columns["playback_mode"]["type"].length == 16
            assert isinstance(layer_columns["volume"]["type"], Integer)
            assert isinstance(layer_columns["created_at"]["type"], DateTime)
            assert layer_columns["created_at"]["type"].timezone is True
            assert all(column["nullable"] is False for column in layer_columns.values())
            assert layer_columns["playback_mode"]["default"] == "'single'::character varying"
            assert layer_columns["volume"]["default"] == "80"
            assert layer_columns["created_at"]["default"] == "now()"

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
            assert isinstance(set_columns["id"]["type"], Uuid)
            assert isinstance(set_columns["layer_id"]["type"], Uuid)
            assert isinstance(set_columns["name"]["type"], Text)
            assert isinstance(set_columns["position"]["type"], Integer)
            assert isinstance(set_columns["loop"]["type"], Boolean)
            assert isinstance(set_columns["shuffle"]["type"], Boolean)
            assert isinstance(set_columns["created_at"]["type"], DateTime)
            assert set_columns["created_at"]["type"].timezone is True
            assert all(column["nullable"] is False for column in set_columns.values())
            assert set_columns["loop"]["default"] == "false"
            assert set_columns["shuffle"]["default"] == "false"
            assert set_columns["created_at"]["default"] == "now()"

            set_tag_columns = {
                column["name"]: column for column in inspector.get_columns("set_tags")
            }
            assert set(set_tag_columns) == {"set_id", "tag_id"}
            assert all(isinstance(column["type"], Uuid) for column in set_tag_columns.values())
            assert all(column["nullable"] is False for column in set_tag_columns.values())
            assert all(column["default"] is None for column in set_tag_columns.values())

            layer_checks = {
                constraint["name"]: constraint["sqltext"]
                for constraint in inspector.get_check_constraints("layer")
            }
            assert layer_checks["ck_layer_position_non_negative"] == '"position" >= 0'
            assert layer_checks["ck_layer_volume_range"] == "volume >= 0 AND volume <= 100"
            playback_values = re.findall(
                r"'([^']+)'::character varying", layer_checks["playback_mode"]
            )
            assert set(playback_values) == {
                "single",
                "multiset",
                "self_stacking",
            }
            assert {
                constraint["name"]: constraint["sqltext"]
                for constraint in inspector.get_check_constraints("set")
            } == {"ck_set_position_non_negative": '"position" >= 0'}
            assert {
                constraint["name"]: constraint["column_names"]
                for constraint in inspector.get_unique_constraints("layer")
            } == {"uq_layer_user_position": ["user_id", "position"]}
            assert {
                constraint["name"]: constraint["column_names"]
                for constraint in inspector.get_unique_constraints("set")
            } == {"uq_set_layer_position": ["layer_id", "position"]}

            foreign_keys = {
                table: {
                    tuple(foreign_key["constrained_columns"]): (
                        foreign_key["referred_table"],
                        tuple(foreign_key["referred_columns"]),
                        foreign_key["options"].get("ondelete"),
                    )
                    for foreign_key in inspector.get_foreign_keys(table)
                }
                for table in ("layer", "set", "set_tags")
            }
            assert foreign_keys == {
                "layer": {("user_id",): ("users", ("id",), "CASCADE")},
                "set": {("layer_id",): ("layer", ("id",), "CASCADE")},
                "set_tags": {
                    ("set_id",): ("set", ("id",), "CASCADE"),
                    ("tag_id",): ("tag", ("id",), "CASCADE"),
                },
            }
            assert inspector.get_pk_constraint("layer")["constrained_columns"] == ["id"]
            assert inspector.get_pk_constraint("set")["constrained_columns"] == ["id"]
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
