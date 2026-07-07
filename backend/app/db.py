"""Database engine, session factory, and the FastAPI session dependency.

Sync SQLAlchemy 2.0: simplest to read and test at single-GM scale. FastAPI runs sync
endpoints in a threadpool, so blocking DB calls don't stall the event loop.
"""

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.settings import get_settings

# One engine per process. `pool_pre_ping` avoids handing out stale connections
# (e.g. after Postgres restarts in dev/compose).
engine = create_engine(get_settings().database_url, pool_pre_ping=True)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """Yield a request-scoped session; always closed afterwards.

    Injected into endpoints via `Depends(get_db)`. Tests override this to bind a
    session to a rolled-back transaction (see tests/conftest.py).
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
