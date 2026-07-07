# ElectroBard

A web-based sound board and music tool for tabletop RPG game masters (GMs). Build a personal sound library, organize it into customizable layers and sets, and trigger audio live during play — a streamlined replacement for cluttered audio systems like Foundry's.

## Status

M0 scaffold — walking skeleton. Backend (FastAPI + Postgres) and frontend (React + TS)
are up with `GET /api/sounds` returning `[]` via a real DB roundtrip; feature milestones
follow. See the [roadmap](docs/roadmap.md).

## How it works

- **Library** — add sounds by uploading files or pasting YouTube links; tag them; preview them.
- **Layers** — independently-mixed channels (starter: music, ambience, sound effects) with their own volume and playback mode.
- **Sets** — groups of sounds within a layer (tag-based), with loop and shuffle.
- **Session view** — trigger any set with one tap, see what's playing, mix per-layer volume live.

Audio plays **client-side** in the GM's browser (Web Audio via Howler.js for files; YouTube IFrame API for links). The GM is the single controller.

## Tech stack

- **Backend**: Python · FastAPI · SQLAlchemy + Alembic · PostgreSQL · REST
- **Frontend**: React + TypeScript · Howler.js
- **Storage**: local disk (self-hosted launch), S3-compatible later

Full detail: [`docs/tech-stack.md`](docs/tech-stack.md).

## Deployment model

Launch: **self-hosted, single GM**, reached over localhost/LAN (phone hits the GM's server on the home network). No auth yet — trusted-network only. Hosted multi-tenant with OAuth is the target.

## Docs

- [Vision](docs/vision.md)
- [Glossary / domain language](CONTEXT.md)
- PRDs: [Sound Library](docs/prd/01-sound-library.md) · [Layers](docs/prd/02-layers.md) · [Sets](docs/prd/03-sets.md) · [Session View](docs/prd/04-session-view.md)
- [Tech stack](docs/tech-stack.md)
- [Architecture decisions](docs/adr/)
- Prototypes: [Session View — Cue Console](prototypes/session-view/) (throwaway design study, no build step)

## Development

### One command up (Docker)

```
docker compose up
```

Brings up Postgres, the backend (running `alembic upgrade head` on start), and the
frontend dev server from a clean checkout — no config needed. Then:

- Frontend: http://localhost:5173
- API: http://localhost:8000/api (e.g. `GET /api/sounds` → `[]`), health at `/health`

Config is environment-driven; copy [`.env.example`](.env.example) to `.env` to override
ports or credentials (no secrets at launch — no auth, local-disk storage).

### Without Docker

Prerequisites: Python 3.12+, Node.js, and a local PostgreSQL. With `.env` pointing
`DATABASE_URL` at your Postgres:

```
# Backend (from backend/)
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload

# Frontend (from frontend/)
npm install
npm run dev
```

More detail: [`docs/dev-setup.md`](docs/dev-setup.md).

## License

Copyright (C) 2026 Matthias Matousek

Licensed under the [GNU Affero General Public License v3.0](LICENSE). Because ElectroBard is a network application, anyone who runs a modified version as a service must make their source available to its users.
