"""DB-backed integration test: the User model persists against real Postgres,
with the UUID PK and DB-defaulted created_at populated on insert.
"""

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import User


def test_user_persists_with_uuid_and_created_at(db: Session) -> None:
    user = User()
    db.add(user)
    db.flush()  # emit INSERT and populate server defaults

    assert isinstance(user.id, uuid.UUID)

    fetched = db.scalar(select(User).where(User.id == user.id))
    assert fetched is not None
    assert isinstance(fetched.created_at, datetime)
    assert fetched.created_at.tzinfo is not None  # timestamptz -> tz-aware
