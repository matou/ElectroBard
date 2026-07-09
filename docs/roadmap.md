# ElectroBard — Roadmap

How the PRDs become shipped software. ElectroBard is a single-developer hobby project, so
milestones are **dependency-ordered** and **undated** — there is no schedule, just a sensible
build order.

Product scope: [vision](vision.md) · [PRDs](prd/) · [glossary](../CONTEXT.md).
Architecture: [tech-stack](tech-stack.md) · [ADRs](adr/).

## MVP / launch definition

**Launch = M0–M3 complete.** The smallest thing a GM can actually run a session with:
self-hosted, single GM, no auth, reached over localhost/LAN (ADR-0002, ADR-0003).

A milestone is done when **every launch-scope requirement in its PRD(s) is demoable** — the
per-feature "out of scope (launch)" cuts already in the PRDs hold. Release-level bar on top of
the individual milestones:

- All four PRDs' launch requirements met and demoable end-to-end.
- Runs per the README deployment model: `docker compose up` (or documented dev commands) on the
  GM's machine; a phone on the same LAN reaches it and plays audio.
- Works in the target browsers on desktop **and** mobile (browser matrix is an open
  question — see [risks](risks.md)).
- CI green: lint, typecheck, and tests pass on both backend and frontend.

Everything past M3 (auth, listeners, transitions, manual sets, mute/solo, Stream Deck, S3,
native apps) is **post-MVP** — parked below, not scheduled.

## Milestones

### M0 — Scaffold & walking skeleton

**Goal:** the repo builds and runs end-to-end with nothing interesting in it yet — a spine to
hang features on.

**Includes:**
- Backend: FastAPI app, SQLAlchemy + Alembic baseline migration, Postgres wired.
- Frontend: React + TypeScript app, typed API client generated from the OpenAPI schema.
- Storage interface stub (`save/get/delete` by key) over local disk (ADR-0001, tech-stack).
- Dev environment + CI (see [dev-setup](dev-setup.md)): one command to bring the stack up; CI
  runs lint + typecheck + tests both sides; test harness in place on both.

**Exit criteria:** stack starts from documented commands; a trivial end-to-end call (e.g. list
sounds → empty array) succeeds from the browser through FastAPI to Postgres; CI is green.

**Depends on:** [data model](data-model.md), [API contract](api-contract.md),
[dev-setup](dev-setup.md).

### M1 — Sound Library

**PRD:** [01 — Sound Library](prd/01-sound-library.md).

**Goal:** a GM can fill a personal library and hear individual sounds.

**Includes:**
- Add sounds: file upload (format validation: MP3/OGG/WAV/M4A-AAC/FLAC) and YouTube link
  (oEmbed for title+duration, video-ID storage, embeddability check at add-time).
- Free-form tags on sounds; tag CRUD.
- **Preview** — first slice of the client `AudioSourcePlayer`: play/stop a single sound of
  either source type in-browser (Howler for files, YouTube IFrame for links).
- Delete (removes from all sets); errored-sound handling (mark + surface).

**Exit criteria:** every PRD-01 launch requirement demoable; a file sound and a YouTube sound
can each be previewed in the browser.

**Depends on:** M0.

**Build backlog:** decisions were charted on the [M1 decision map (#20)](https://github.com/matou/ElectroBard/issues/20) and turned into an ordered, dependency-wired build backlog — issues [#34–#43](https://github.com/matou/ElectroBard/issues/34) (`M1` + `ready-for-agent`), starting at the Sound & Tag models (#34).

### M2 — Layers & Sets (configuration)

**PRDs:** [02 — Layers](prd/02-layers.md), [03 — Sets](prd/03-sets.md) — the **data/config**
half. Runtime playback behavior lands in M3.

**Goal:** a GM can organize the library into layers and tag-based sets and configure how they
behave, before any live triggering exists.

**Includes:**
- Layers: seed three starter layers on first run; create / rename / delete / reorder; per-layer
  playback mode (single / multiset / self-stacking) and volume (default 80%); config persists.
- Sets: tag-based composition with OR semantics across tags, dynamic membership, A→Z ordering
  when unshuffled; loop and shuffle settings; a set may mix source types.
- Membership **resolution** (which sounds a set contains right now) — testable via API without
  audio. The *next-cycle-on-change* runtime rule is exercised in M3.

**Exit criteria:** layers and sets are configurable and persisted; set membership resolves
correctly from tags via the API.

**Depends on:** M1 (needs sounds + tags).

### M3 — Session View & live playback

**PRD:** [04 — Session View](prd/04-session-view.md), plus the **runtime** rules of PRDs 02/03.

**Goal:** the payoff — a GM runs a real session, triggering sets and mixing live.

**Includes:**
- Mature `AudioSourcePlayer`: multiple concurrent sources, per-layer volume routing, uniform
  play/stop/setVolume/status across Howler and YouTube.
- Session layout: all layers at once, a button per set with live status, per-layer volume slider.
- Triggering: toggle play/stop; single-set hard cut; multiset mixing; self-stacking with stack
  count badge + stop-all (✕), no per-instance stop.
- Set playback lifecycle: order/shuffle at runtime (re-shuffle each loop), loop, non-looping set
  returns to stopped, membership change applies next cycle.
- Program state in the client; **no resume across reload** (reload stops all audio).

**Exit criteria:** every PRD-04 launch requirement demoable; a GM can play a full session
end-to-end on desktop and mobile. **This completes the MVP.**

**Depends on:** M2 (and the M1 player slice).

## Cross-cutting workstreams

Spanning milestones rather than living in one:

- **Audio player abstraction** — introduced in M1 (preview), matured in M3 (concurrency, mixing,
  volume routing). The single seam over Howler + YouTube (ADR-0001, tech-stack).
- **Typed API client** — regenerated from OpenAPI whenever backend endpoints change (M0 onward).
- **Testing** — harness stood up in M0; each milestone ships with its tests (CLAUDE.md makes
  testability a first-class concern).

## Post-MVP (parked, not scheduled)

From the PRDs' and tech-stack's future sections — no milestone yet:

- Real auth (OAuth — Google/Discord) (ADR-0002).
- Passive **listeners** + one-way broadcast over WebSockets; per-listener mixes (ADR-0003).
- Transition effects / crossfades (likely raw Web Audio behind the player interface).
- Manual sets (hand-picked sounds/order); hybrid manual+tag sets.
- Mute / solo per layer.
- Stream Deck support.
- S3-compatible storage; hosted multi-tenant deployment.
- Dedicated mobile / desktop apps.
