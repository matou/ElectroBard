"""M1: sound, tag, sound_tags

Adds the M1 Sound Library schema on top of the M0 baseline (data-model.md → Sound/Tag):
the single-table `sound` (kind discriminator as checked text), the per-user `tag`, and
the `sound_tags` many-to-many join. No Layer/Set here — those are M2.

Revision ID: 0002_m1_sound_tag
Revises: 0001_baseline_user
Create Date: 2026-07-09
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002_m1_sound_tag"
down_revision: str | None = "0001_baseline_user"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "sound",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        # `kind` as checked text (not native PG enum): VARCHAR + CHECK IN (...).
        # create_constraint=True is required (defaults to False in SQLAlchemy 2.0).
        sa.Column(
            "kind",
            sa.Enum(
                "file",
                "youtube",
                native_enum=False,
                create_constraint=True,
                length=16,
                name="sound_kind",
            ),
            nullable=False,
        ),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column(
            "is_errored",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
        sa.Column("error_detail", sa.Text(), nullable=True),
        # file-only columns
        sa.Column("storage_key", sa.Text(), nullable=True),
        sa.Column("content_type", sa.Text(), nullable=True),
        # youtube-only column
        sa.Column("youtube_video_id", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_table(
        "tag",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("user_id", "name", name="uq_tag_user_name"),
    )

    op.create_table(
        "sound_tags",
        sa.Column(
            "sound_id",
            sa.Uuid(),
            sa.ForeignKey("sound.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "tag_id",
            sa.Uuid(),
            sa.ForeignKey("tag.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )


def downgrade() -> None:
    # Reverse creation order: join table first, then the entities it references.
    op.drop_table("sound_tags")
    op.drop_table("tag")
    op.drop_table("sound")
