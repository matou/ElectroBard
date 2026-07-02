# ElectroBard

A web-based sound board and music tool for tabletop RPG game masters (GMs). Build a personal sound library, organize it into customizable layers and sets, and trigger audio live during play — a streamlined replacement for cluttered audio systems like Foundry's.

## Status

Early planning. No application code yet — this repo currently holds product and design docs.

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

## Development

Not yet scaffolded. Prerequisites will include Python 3.12+, Node.js, and PostgreSQL. Setup instructions to follow once the codebase is initialized.
