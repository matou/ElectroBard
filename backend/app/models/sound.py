"""Sound — one library entry, backed by exactly one audio source (data-model.md).

Single-table design: a `kind` discriminator (`file` | `youtube`) plus nullable
type-specific columns. Cleanest for two variants; joined-table inheritance is revisited
only if source types multiply. `kind` is **checked text**, not a native PG enum
(`native_enum=False` renders VARCHAR + a CHECK constraint) per the data-model "Enums" note.

The `sound_tags` association table (Sound ↔ Tag many-to-many) is defined here; `Tag`
references it to complete the other side of the relationship (avoids an import cycle).
"""

import uuid
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    Column,
    Enum,
    ForeignKey,
    Integer,
    Table,
    Text,
    Uuid,
    false,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.tag import Tag


class SoundKind(StrEnum):
    """The audio-source discriminator. Stored as checked text, not a native enum."""

    FILE = "file"
    YOUTUBE = "youtube"


# Sound ↔ Tag many-to-many. Composite PK `(sound_id, tag_id)`; deleting either side
# drops its join rows via ON DELETE CASCADE (data-model.md → Join tables).
sound_tags = Table(
    "sound_tags",
    Base.metadata,
    Column("sound_id", Uuid(), ForeignKey("sound.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", Uuid(), ForeignKey("tag.id", ondelete="CASCADE"), primary_key=True),
)


class Sound(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "sound"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[SoundKind] = mapped_column(
        # checked text, not native PG enum: VARCHAR + a CHECK IN (...) constraint.
        # create_constraint defaults to False in SQLAlchemy 2.0, so it is explicit here.
        Enum(
            SoundKind,
            native_enum=False,
            create_constraint=True,
            length=16,
            name="sound_kind",
        ),
        nullable=False,
    )
    # Best-effort track length; null when unparseable (file) or not yet known (youtube).
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Machine skip-flag. M1 exposes the column read-only; the write path is M3 (#25),
    # so an M1 sound is always false in practice.
    is_errored: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    error_detail: Mapped[str | None] = mapped_column(Text, nullable=True)

    # file-only columns
    storage_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_type: Mapped[str | None] = mapped_column(Text, nullable=True)

    # youtube-only column
    youtube_video_id: Mapped[str | None] = mapped_column(Text, nullable=True)

    tags: Mapped[list["Tag"]] = relationship(secondary=sound_tags, back_populates="sounds")
