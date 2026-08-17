"""Tag — a free-form label owned by a User; drives set composition (data-model.md).

`name` is unique per user (`UNIQUE(user_id, name)`) so a GM never has two identical
tags, while different users may reuse the same label.
"""

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.sound import sound_tags

if TYPE_CHECKING:
    from app.models.sound import Sound


class Tag(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "tag"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_tag_user_name"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)

    sounds: Mapped[list["Sound"]] = relationship(secondary=sound_tags, back_populates="tags")
