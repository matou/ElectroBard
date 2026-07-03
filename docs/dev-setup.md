# ElectroBard — Dev Setup, CI & Testing

How the project is built, run locally, tested, and gated. This is the concrete plan behind
milestone **M0** (scaffold & walking skeleton) and the roadmap's "CI green" release bar.

Build order: [roadmap](roadmap.md). Stack decisions: [tech-stack](tech-stack.md).
Contract under test: [API contract](api-contract.md).

## Prerequisites

- **Python 3.12+**, **Node.js** (LTS), **PostgreSQL** — or just **Docker** (the compose path
  bundles Postgres, so a local PG install is optional).

## Repository layout (target)

A single repo, two apps:

```
backend/    FastAPI app, SQLAlchemy models, Alembic migrations, pytest suite
frontend/   React + TypeScript app, generated API client, component tests
docs/       these planning docs
compose.yaml    dev stack: db + backend + frontend
```

Kept in one repo so a change spanning the API and its typed client lands in one commit and one
CI run.

## Local development

- **One command up** (roadmap M0 exit criterion): `docker compose up` brings up Postgres, the
  backend (with migrations applied), and the frontend dev server. Documented non-Docker commands
  (`uvicorn` / `npm run dev` against a local Postgres) are the fallback.
- **Config via environment** — database URL, storage root path, port. A committed `.env.example`
  lists every var; no secrets at launch (no auth, local disk).
- **Migrations**: `alembic upgrade head` runs on backend start (and in CI). Schema changes are
  always a new Alembic revision — never hand-edited tables (data-model).
- **Storage**: the `save/get/delete` interface points at a local-disk directory in dev
  (ADR-0001); the same interface swaps to S3-compatible later with no call-site changes.

## Typed API client

The frontend client is **generated from FastAPI's OpenAPI schema**, not hand-written
(tech-stack). Regeneration is a scripted step (`npm run gen:api` or similar) run whenever
backend endpoints change. CI regenerates the client from the live schema and diffs it against
the committed one; **any difference fails the build** (like a lockfile check). This forces
"changed an endpoint → commit the regenerated client," so the API and its typed client can never
drift on `main`.

## Testing strategy

Testability is a first-class constraint (CLAUDE.md): dependency injection and small, decoupled
components exist partly so each layer tests in isolation.

**Backend (pytest):**
- **Unit** — pure domain logic with no I/O. The prize target is **set membership resolution**
  (tag OR-matching, A→Z ordering) — testable without a database or audio, exactly as the roadmap
  wants for M2.
- **Integration** — API endpoints against a real Postgres (throwaway test DB / transactional
  rollback per test), covering tenant scoping, cascades, and the error shapes in the API
  contract.
- **Injected boundaries** — the storage interface and the YouTube oEmbed lookup are injected, so
  tests use fakes (no disk, no network) and upload/add-YouTube flows stay deterministic.

**Frontend:**
- **Component/logic tests** for library, layer/set config, and session-view interaction
  (trigger toggles, single-set hard cut, self-stacking stack count).
- **`AudioSourcePlayer` behind a fake** — Howler and the YouTube IFrame API are mocked at the
  player interface, so UI logic is tested without real audio. The interface seam (tech-stack)
  is what makes this possible.
- **Generated client** — not unit-tested. It's produced by the generator (not hand-written) and
  kept in-sync by the CI staleness check above, so tests would only re-assert what generation
  already guarantees. Frontend tests target **our** UI/state logic (which mocks the client), not
  the HTTP transport.

**Not automated at launch:** real cross-browser audio playback and LAN/mobile reach are
**manual** checks against the roadmap's release bar (the browser matrix is an open question in
[risks](risks.md)).

## Continuous integration

CI must be **green to ship** (roadmap release bar). On every push / PR it runs both sides:

| Stage | Backend | Frontend |
|---|---|---|
| Lint | ruff (or equivalent) | ESLint |
| Typecheck | mypy / pyright | `tsc --noEmit` |
| Test | pytest (+ ephemeral Postgres) | component tests |
| Drift | — | generated API client matches OpenAPI |

The harness is stood up in **M0** and every milestone ships with its own tests, so the suite
grows with the code rather than being retrofitted.

## Open questions

Tracked in the [risks log](risks.md):

- Exact lint/format/typecheck tools (ruff vs. flake8+black; mypy vs. pyright).
- Frontend test runner (Vitest vs. Jest) and component-test library.
- CI provider (GitHub Actions assumed, matching GitHub Issues tracking).
- Target browser/OS matrix for the manual playback checks.
