"""Cross-cutting FastAPI dependencies.

`get_current_user` is the auth stub (ADR-0002): real authentication is deferred, so
every request resolves to a single implicit User. It is resolved get-or-create so the
first request on a fresh database lazily seeds that row; subsequent requests reuse it.
Feature endpoints (M1+) depend on it to scope every query to the owning User.
"""

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.services import create_user_with_starter_layers


def get_current_user(db: Session = Depends(get_db)) -> User:
    """Return the single implicit current user, creating it on first use.

    The get-or-create is the genuine DB roundtrip that proves the skeleton is wired:
    a real SELECT, and an INSERT the first time. It is idempotent — the DB only ever
    holds one such row — because auth is deferred to a single-tenant stub.
    """
    user = db.scalar(select(User).order_by(User.created_at).limit(1))
    if user is None:
        user = create_user_with_starter_layers(db)
    return user
