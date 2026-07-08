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
    """Yield a request-scoped session as a unit of work; always closed afterwards.

    Commit on a clean request so writes persist (e.g. the implicit user seeded by
    get_current_user); roll back if the endpoint raises so a failed request leaves no
    partial state. Without the commit, `close()` would roll the transaction back and
    nothing would ever persist. Injected via `Depends(get_db)`; tests override this to
    bind a session to a rolled-back transaction (see tests/conftest.py).
    """
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
