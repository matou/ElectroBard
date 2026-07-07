"""Declarative base and the cross-cutting column conventions (data-model.md).

Every first-class entity gets a UUID primary key and a `created_at` timestamptz.
No `updated_at` at launch. Mixins keep these conventions in one place so M1/M2
models inherit them without repetition.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Shared declarative base for all ElectroBard models."""


class UUIDPrimaryKeyMixin:
    """UUID primary key. Generated app-side (portable, testable) rather than in the DB."""

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)


class TimestampMixin:
    """`created_at` timestamptz, defaulted by the database on insert."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
