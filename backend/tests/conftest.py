"""Pytest harness: an ephemeral, transactionally-isolated Postgres session per test.

Pattern (SQLAlchemy 2.0): open one connection, begin an outer transaction, bind the
session to it, then roll back after the test. Every test sees a clean database and
nothing is ever committed for real — fast and order-independent.

The test database URL comes from TEST_DATABASE_URL (falling back to DATABASE_URL).
CI (#8/#10) and compose (#9) provide the Postgres service; there is no in-memory
fallback because we test against real Postgres on purpose.
"""

import os
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.db import get_db
from app.main import create_app
from app.models import Base


def _test_database_url() -> str:
    return os.environ.get("TEST_DATABASE_URL") or os.environ.get(
        "DATABASE_URL",
        "postgresql+psycopg://electrobard:electrobard@localhost:5432/electrobard",
    )


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    """Session-wide engine; build the schema once, drop it at the end.

    Schema is built from the models (`create_all`) rather than by running migrations,
    keeping the test harness decoupled from Alembic. That `alembic upgrade head`
    itself works on a fresh DB is asserted separately (see the issue's acceptance).
    """
    engine = create_engine(_test_database_url())
    Base.metadata.create_all(engine)
    try:
        yield engine
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()


@pytest.fixture
def db(engine: Engine) -> Iterator[Session]:
    """A session bound to a transaction that is always rolled back."""
    connection = engine.connect()
    transaction = connection.begin()
    # join_transaction_mode="create_savepoint" lets test code call commit()/rollback()
    # against the session while the outer transaction still owns the real rollback.
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def client(db: Session) -> Iterator[TestClient]:
    """A TestClient whose `get_db` dependency yields the rolled-back test session."""
    app = create_app()
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
