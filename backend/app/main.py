"""FastAPI application factory.

M0 is a walking skeleton: this exposes only liveness/readiness. The first real
domain endpoint (`GET /api/sounds`) lands in #6; feature routers mount under `/api`.
"""

from fastapi import Depends, FastAPI
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db


def create_app() -> FastAPI:
    """Build and configure the FastAPI app. A factory keeps construction explicit
    and lets tests build isolated instances.
    """
    app = FastAPI(title="ElectroBard API")

    @app.get("/health")
    def health() -> dict[str, str]:
        """Liveness: the process is up and serving."""
        return {"status": "ok"}

    @app.get("/health/db")
    def health_db(db: Session = Depends(get_db)) -> dict[str, str]:
        """Readiness: the database is reachable."""
        db.execute(text("SELECT 1"))
        return {"status": "ok"}

    return app


app = create_app()
