"""FastAPI application factory.

M0 is a walking skeleton: this exposes only liveness/readiness. The first real
domain endpoint (`GET /api/sounds`) lands in #6; feature routers mount under `/api`.
"""

from fastapi import Depends, FastAPI
from fastapi.routing import APIRoute
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.routers import sounds


def _route_name_operation_id(route: APIRoute) -> str:
    """Use the endpoint's function name as its OpenAPI operationId.

    FastAPI's default appends path + method (`list_sounds_api_sounds_get`), which the
    client generator turns into ugly names. The route name gives clean, stable
    operationIds (`list_sounds` -> `listSounds()`). Route names are unique per app.
    """
    return route.name


def create_app() -> FastAPI:
    """Build and configure the FastAPI app. A factory keeps construction explicit
    and lets tests build isolated instances.
    """
    app = FastAPI(
        title="ElectroBard API",
        generate_unique_id_function=_route_name_operation_id,
    )

    # Feature routers live under `/api` (api-contract conventions).
    app.include_router(sounds.router, prefix="/api")

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
