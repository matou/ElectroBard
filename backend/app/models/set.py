"""Set — an ordered, tag-composed group of Sounds within a Layer."""

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    ForeignKey,
    Integer,
    Table,
    Text,
    UniqueConstraint,
    Uuid,
    false,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.layer import Layer
    from app.models.tag import Tag


set_tags = Table(
    "set_tags",
    Base.metadata,
    Column("set_id", Uuid(), ForeignKey("set.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", Uuid(), ForeignKey("tag.id", ondelete="CASCADE"), primary_key=True),
)


class Set(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "set"
    __table_args__ = (
        CheckConstraint("position >= 0", name="ck_set_position_non_negative"),
        UniqueConstraint("layer_id", "position", name="uq_set_layer_position"),
    )

    layer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("layer.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    loop: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    shuffle: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )

    layer: Mapped["Layer"] = relationship(back_populates="sets")
    tags: Mapped[list["Tag"]] = relationship(
        secondary=set_tags, back_populates="sets", order_by="Tag.name"
    )
