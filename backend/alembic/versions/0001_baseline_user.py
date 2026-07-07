"""baseline: users table

The M0 baseline schema. Only the `User` table exists at this milestone; Sound/Tag
arrive in M1 and Layer/Set in M2 as their own revisions (data-model.md).

Revision ID: 0001_baseline_user
Revises:
Create Date: 2026-07-07
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001_baseline_user"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("users")
