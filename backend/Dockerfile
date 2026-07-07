# Backend image for the dev compose stack (#9). FastAPI + sync SQLAlchemy on psycopg.
# Deps are installed with uv into a venv OUTSIDE /app so a dev bind-mount of the source
# over /app doesn't shadow them (compose.yaml mounts ./backend -> /app for live reload).
FROM python:3.13-slim

# uv: fast, lockfile-driven installs (matches local dev tooling).
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Keep the environment off /app so the source bind-mount can't hide it.
ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_COMPILE_BYTECODE=1 \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app

# Install dependencies first (cached until the lockfile changes), app code second.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY . .

EXPOSE 8000

# Migrations on start (dev-setup: `alembic upgrade head` on backend start), then serve.
# --reload pairs with the source bind-mount for a live dev loop.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --reload"]
