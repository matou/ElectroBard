# ElectroBard — Tech Stack

Decisions from the planning session. Architectural rationale lives in `docs/adr/`.

## Architecture

- **Client-side audio** — the GM's browser is the audio engine; the backend never decodes or mixes audio (ADR-0001).
- **Multi-tenant data model, auth deferred** — `User` owns every entity from day one; the login gate is stubbed to an implicit current user until real auth lands (ADR-0002).
- **Single active controller** — no real-time layer at launch; listeners/broadcast are future (ADR-0003).
- **Deployment**: self-hosted (single GM over localhost/LAN) at launch; hosted multi-tenant is the target.

## Backend

- **Language**: Python
- **Framework**: FastAPI (typed schemas, auto OpenAPI)
- **ORM / migrations**: SQLAlchemy + Alembic
- **Database**: PostgreSQL
- **API**: REST
- **File storage**: local disk behind a thin storage interface (`save/get/delete` by key); swappable to S3-compatible later.
- **YouTube**: oEmbed at add-time for title/duration; store video ID; validate embeddability.

## Frontend

- **Framework**: React + TypeScript
- **Audio (files)**: Howler.js
- **Audio (YouTube)**: YouTube IFrame Player API (best-effort — coarse volume, no true fades)
- **Player abstraction**: one internal `AudioSourcePlayer` interface (`play / stop / setVolume / status`) wrapping both Howler and the YouTube iframe, so the UI drives all sources uniformly. This is the playback-level expression of the metadata-level source abstraction (ADR-0001).
- **API client**: typed, generated from FastAPI's OpenAPI schema.

## Future (not launch)

- Real auth via OAuth (leaning Google / Discord).
- Transition effects (crossfades) — likely a drop to raw Web Audio behind the player interface.
- Mute/solo per layer; passive listeners + one-way broadcast (WebSockets); Stream Deck; dedicated mobile/desktop apps; S3 storage.
