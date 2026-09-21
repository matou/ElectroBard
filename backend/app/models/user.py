"""User — the unit of data ownership (data-model.md).

Minimal at launch: auth is deferred (ADR-0002), so a single implicit user is seeded
or lazily created and every request resolves to it. Real identity/OAuth columns land
with the auth milestone. Sound/Tag (M1) and Layer/Set (M2) will FK to this table.
"""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.layer import Layer


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    # Historical completion marker. It deliberately has no database default: null
    # distinguishes a User that still needs explicit starter-Layer provisioning.
    starter_layers_provisioned_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    layers: Mapped[list["Layer"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan"
    )
