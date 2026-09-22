"""Layer — an ordered, independently mixed channel owned by a User."""

import uuid
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Enum, ForeignKey, Integer, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.set import Set
    from app.models.user import User


class PlaybackMode(StrEnum):
    SINGLE = "single"
    MULTISET = "multiset"
    SELF_STACKING = "self_stacking"


class Layer(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "layer"
    __table_args__ = (
        CheckConstraint("position >= 0", name="ck_layer_position_non_negative"),
        CheckConstraint("volume >= 0 AND volume <= 100", name="ck_layer_volume_range"),
        UniqueConstraint("user_id", "position", name="uq_layer_user_position"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    playback_mode: Mapped[PlaybackMode] = mapped_column(
        Enum(
            PlaybackMode,
            native_enum=False,
            create_constraint=True,
            length=16,
            name="playback_mode",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        default=PlaybackMode.SINGLE,
        server_default=text("'single'"),
    )
    volume: Mapped[int] = mapped_column(
        Integer, nullable=False, default=80, server_default=text("80")
    )

    owner: Mapped["User"] = relationship(back_populates="layers")
    sets: Mapped[list["Set"]] = relationship(
        back_populates="layer",
        cascade="all, delete-orphan",
        order_by="Set.position",
    )
