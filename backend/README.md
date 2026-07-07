# ElectroBard — Backend

FastAPI + SQLAlchemy (sync) + Alembic + Postgres. The M0 walking-skeleton spine.

The one-command Docker path lands in #9. These are the **fallback** dev commands
(roadmap M0), run from `backend/`. Dependencies are managed with [uv](https://docs.astral.sh/uv/).

## Setup

```bash
uv sync                     # create .venv and install deps (incl. dev group)
cp .env.example .env        # point DATABASE_URL at your Postgres
```

You need a reachable Postgres. Any instance works; e.g. a throwaway one:

```bash
docker run --rm -d --name eb-pg -p 5432:5432 \
  -e POSTGRES_USER=electrobard -e POSTGRES_PASSWORD=electrobard \
  -e POSTGRES_DB=electrobard postgres:16
```

## Migrate & run

```bash
uv run alembic upgrade head          # create the schema on a fresh DB
uv run uvicorn app.main:app --reload # serve on :8000
```

Check it: `curl localhost:8000/health` and `curl localhost:8000/health/db`.

## Test, lint, typecheck

```bash
uv run pytest        # unit + DB-backed integration (needs Postgres)
uv run ruff check .  # lint
uv run mypy .        # typecheck
```

## Layout

```
app/
  main.py         FastAPI app factory + health endpoints
  settings.py     env-driven config (pydantic-settings)
  db.py           engine, session factory, get_db dependency
  models/         SQLAlchemy models (Base + mixins, User)
alembic/          migration env + versions (0001 baseline: users)
tests/            pytest harness (transactional rollback per test)
```
