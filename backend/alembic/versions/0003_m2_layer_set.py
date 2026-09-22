"""M2: Layer, Set, set_tags, and starter-Layer provisioning.

Revision ID: 0003_m2_layer_set
Revises: 0002_m1_sound_tag
Create Date: 2026-09-21
"""

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

import sqlalchemy as sa

from alembic import op

revision: str = "0003_m2_layer_set"
down_revision: str | None = "0002_m1_sound_tag"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("starter_layers_provisioned_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "layer",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column(
            "playback_mode",
            sa.Enum(
                "single",
                "multiset",
                "self_stacking",
                native_enum=False,
                create_constraint=True,
                length=16,
                name="playback_mode",
            ),
            server_default="single",
            nullable=False,
        ),
        sa.Column("volume", sa.Integer(), server_default="80", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("position >= 0", name="ck_layer_position_non_negative"),
        sa.CheckConstraint("volume >= 0 AND volume <= 100", name="ck_layer_volume_range"),
        sa.UniqueConstraint("user_id", "position", name="uq_layer_user_position"),
    )

    op.create_table(
        "set",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "layer_id", sa.Uuid(), sa.ForeignKey("layer.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("loop", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("shuffle", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("position >= 0", name="ck_set_position_non_negative"),
        sa.UniqueConstraint("layer_id", "position", name="uq_set_layer_position"),
    )

    op.create_table(
        "set_tags",
        sa.Column(
            "set_id", sa.Uuid(), sa.ForeignKey("set.id", ondelete="CASCADE"), primary_key=True
        ),
        sa.Column(
            "tag_id", sa.Uuid(), sa.ForeignKey("tag.id", ondelete="CASCADE"), primary_key=True
        ),
    )

    # Existing Users predate the explicit creation service. Backfill their ordinary
    # starter rows and markers in this migration's transaction.
    connection = op.get_bind()
    user_ids = connection.scalars(sa.text("SELECT id FROM users")).all()
    provisioned_at = datetime.now(UTC)
    layer_table = sa.table(
        "layer",
        sa.column("id", sa.Uuid()),
        sa.column("user_id", sa.Uuid()),
        sa.column("name", sa.Text()),
        sa.column("position", sa.Integer()),
        sa.column("playback_mode", sa.String()),
        sa.column("volume", sa.Integer()),
    )
    starters = (
        ("Music", "single"),
        ("Ambience", "multiset"),
        ("Sound Effects", "self_stacking"),
    )
    if user_ids:
        connection.execute(
            layer_table.insert(),
            [
                {
                    "id": uuid.uuid4(),
                    "user_id": user_id,
                    "name": name,
                    "position": position,
                    "playback_mode": playback_mode,
                    "volume": 80,
                }
                for user_id in user_ids
                for position, (name, playback_mode) in enumerate(starters)
            ],
        )
        connection.execute(
            sa.text(
                "UPDATE users SET starter_layers_provisioned_at = :provisioned_at "
                "WHERE starter_layers_provisioned_at IS NULL"
            ),
            {"provisioned_at": provisioned_at},
        )


def downgrade() -> None:
    op.drop_table("set_tags")
    op.drop_table("set")
    op.drop_table("layer")
    op.drop_column("users", "starter_layers_provisioned_at")
