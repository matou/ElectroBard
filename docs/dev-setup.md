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
- **API access (same-origin)** — the frontend dev server proxies `/api` to the backend, so the
  browser talks to a single origin and needs no CORS ([ADR-0004](adr/0004-same-origin-api-proxy.md)).
  The generated client calls relative `/api/...` URLs; `VITE_API_PROXY_TARGET` sets where the proxy
  forwards — the `backend` service in the compose stack, the local backend when running standalone.
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
**manual** checks against the roadmap's [M3 release bar](roadmap.md#m3--session-view--live-playback).
The exact matrix and checks are below.

### M3 browser and device QA

At launch, support the current stable browser release on the current shipping OS
version in each row. Record the tested browser version, OS version, device model,
date, and result in the M3 launch QA report. Recheck after major browser or OS
upgrades; older versions are not claimed without testing. iOS Brave is a separate
target even though it uses WebKit. Run the phone rows on physical devices.

| Device/OS | Required browsers |
|---|---|
| Windows desktop | Chrome, Firefox |
| macOS desktop | Chrome, Firefox, Safari |
| iPhone / current iOS | Safari, Brave |
| Android phone / current Android | Chrome |

Each row must pass the following foreground checks on the actual browser. A first
Set tap may lead to a visible browser-blocked state and a successful user-tap
**Retry audio**; a silent stall, false Playing indicator, or automatic retry
without a user gesture fails. Log the initial and retry outcomes separately.

1. From a fresh page load with no earlier interaction, trigger a file-only Set,
   a YouTube-only Set, and a mixed-source Set. Confirm audible playback and
   correct Starting/Playing/Blocked/Stopped state. If either engine blocks,
   Retry holds and starts the same Sound without advancing the pass or adding
   a stack instance; Stop works while blocked.
2. Play two file sources, a file plus YouTube, and two YouTube sources in
   concurrent Sets or self-stacked instances. Confirm audible overlap, accurate
   active and blocked counts, per-Layer volume changes, and Stop this Set /
   Stop all. A blocked instance must not erase another instance's Playing state.
3. Exercise Library Preview and Recheck for both source types, including a
   browser-blocked attempt; only actual YouTube playback can clear an errored
   Sound. Exercise normal end, a transient load/play failure, a persistent YouTube
   error, and a browser-blocked start. Check that only the persistent YouTube
   error follows the existing error-write contract; a browser block keeps the
   same Sound pending and has a visible Retry. Check that startup cannot remain
   in Starting indefinitely after a rejected or suppressed play attempt.
4. On each phone browser, run via LAN HTTP by hostname and IP. Confirm file
   byte/range delivery, YouTube iframe load and network access, and usable
   playback with representative uploaded formats. Include an IFrame error 153
   check where possible; a missing Referer must not be hidden as success.
5. On phones, switch apps and lock/unlock the screen during file-only,
   YouTube-only, and mixed playback. Continued background audio is not required.
   On return, the UI must reflect actual playback and offer a user-tap recovery
   path if interrupted; it must not auto-resume. On iOS, check speaker and an
   available Bluetooth or wired output route, including route changes.

The existing off-screen 1 × 1 YouTube player conflicts with YouTube's documented
embed size/visibility constraint. This is an explicit [launch risk](risks.md#risks),
not evidence that the iframe will work on any given device. If a required
foreground combination fails, block launch and revisit the player presentation
or the support decision. The research context and first-party citations are in
[M3 mobile browser audio constraints](research/m3-mobile-browser-audio.md).

## Continuous integration

### M2 browser journey

The Playwright journey exercises the running React app, generated API client,
FastAPI, and Postgres. It starts with the starter Layers in a clean database,
configures and reorders Layers and Sets, adds both Sound source types, changes
Tags, checks resolved membership without playing audio, reloads, and verifies
deletion leaves Library Sounds and Tags intact. Run it as the M2 pre-merge check
in a fresh Compose project (use free ports 5432, 8000, and 5173):

```sh
docker compose -p electrobard-m2qa up -d --build --wait
cd frontend && npm ci && npx playwright install chromium && npm run test:e2e
cd .. && docker compose -p electrobard-m2qa down -v
```

CI runs the same journey in the `M2 browser journey · FastAPI · Postgres` job
for every pull request. Keep the command above for local pre-merge verification.

The browser test changes data and expects a fresh database. The separate API
integration suite covers foreign tenant access, one-time provisioning, ordering
invariants, and errored Sound visibility, including states the M2 UI cannot create.

CI must be **green to ship** (roadmap release bar). On every push / PR it runs both sides:

| Stage | Backend | Frontend |
|---|---|---|
| Lint | ruff (or equivalent) | ESLint |
| Typecheck | mypy / pyright | `tsc --noEmit` |
| Test | pytest (+ ephemeral Postgres) | component tests |
| Drift | — | generated API client matches OpenAPI |
| M2 journey | FastAPI + Postgres | Playwright + React |

The harness is stood up in **M0** and every milestone ships with its own tests, so the suite
grows with the code rather than being retrofitted.

## Open questions

The M3 browser matrix and unlock behavior were decided in [#92](https://github.com/matou/ElectroBard/issues/92).

Settled in M0: lint/typecheck is **ruff + mypy** (backend) and **ESLint + tsc** (frontend);
the frontend runner is **Vitest**; CI runs on **GitHub Actions** ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)).
