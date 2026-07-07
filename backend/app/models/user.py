"""User — the unit of data ownership (data-model.md).

Minimal at launch: auth is deferred (ADR-0002), so a single implicit user is seeded
or lazily created and every request resolves to it. Real identity/OAuth columns land
with the auth milestone. Sound/Tag (M1) and Layer/Set (M2) will FK to this table.
"""

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"
