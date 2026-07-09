# ElectroBard — Risks & Open Questions

The living register of what could bite us and what's undecided. The other planning docs
forward-link here rather than each carrying its own open-items list. Add rows as they surface;
strike them (or move to an ADR) when resolved.

Context: [roadmap](roadmap.md) · [data model](data-model.md) · [API contract](api-contract.md) ·
[dev-setup](dev-setup.md) · [ADRs](adr/).

## Risks

Things that could go wrong. "Accepted" = a known, deliberate launch trade-off, not an oversight.

| # | Risk | Impact | Status / mitigation |
|---|---|---|---|
| R1 | **Mobile-browser audio unlock** — phones block audio until a user gesture; the GM's phone-on-LAN is a primary use case (README). | Core session-view flow could silently fail to play on mobile. | **Open, highest concern.** Gate audio-engine init on a user gesture; verify on real mobile early in M3. Ties to the browser-matrix question (Q10). |
| R2 | **YouTube as a source** — videos go private/removed/embed-blocked at any time; the IFrame API gives only coarse volume and no true fades (tech-stack). | Sets silently lose sounds; mix quality is capped. | Mitigated: keyless oEmbed probe at add-time (warn-only heuristic — `401`→warn, `400`/`404`→reject) + client IFrame `onError` (`101`/`150`/`100`) as the authoritative check that flips `is_errored` & skips (ADR-0005, PRD-01). Fades are post-MVP. Coarse volume accepted. |
| R3 | **No auth — trusted-network only** (ADR-0002). | Anyone on the LAN can reach the app and the GM's library. | Accepted for self-hosted launch. **Must revisit before any hosted/public deployment.** |
| R4 | **No upload size cap** (PRD-01). | A GM can exhaust their own disk. | Accepted (self-hosted, GM's own disk). Add a cap if it becomes a problem. |
| R5 | **Program lost on reload** mid-session (ADR-0003). | GM re-triggers audio after a refresh/crash during play. | Accepted by design — no playback persistence. |
| R6 | **Two controller views = double audio** (ADR-0003). | Overlapping playback if the GM opens a second tab/device. | Unsupported by design; single active controller. Consider a soft warning if cheap. |
| R7 | **Upload duration extraction** — uploaded files have no oEmbed to supply `duration_seconds` (data-model). | Missing durations unless decoded somewhere. | ~~Open~~ **Resolved (ADR-0006):** server-side mutagen probe at upload; null on parse failure, upload still succeeds. YouTube stays null (ADR-0005). |

## Open questions

Decisions not yet made. "Leaning" is the current default, not a commitment. "Resolve by" is the
milestone the answer is needed for (dependency order, not a date — this is a solo hobby project).

| # | Question | Leaning | Resolve by |
|---|---|---|---|
| Q1 | Volume stored as float `0.0–1.0` vs. integer percent `0–100`. | **Resolved: integer `0–100`** (exact, matches the UI slider; ÷100 for Howler). | M2 |
| Q2 | Native Postgres enums vs. checked text for `kind` / `playback_mode`. | Checked text (evolves cleanly; enum-type changes fight Alembic). | M0 |
| Q3 | Is `Set.position` enough for session-view ordering, or is grouping metadata needed? | — | M2/M3 |
| Q4 | Tag assignment: full-list `PATCH /sounds/{id}` vs. dedicated add/remove endpoints. | Full-list (single recompute path). | M1 |
| Q5 | Membership resolution returns full sound objects vs. IDs (payload vs. round-trips). | — | M2 |
| Q6 | Large-file upload: streamed vs. buffered handling (no size cap). | — | M1 |
| Q7 | Backend lint/format/typecheck toolchain (ruff vs. flake8+black; mypy vs. pyright). | — | M0 |
| Q8 | Frontend test runner (Vitest vs. Jest) + component-test library. | Vitest. | M0 |
| Q9 | CI provider. | GitHub Actions (matches GitHub Issues tracking). | M0 |
| Q10 | Target browser/OS support matrix for manual playback checks. | — | Before launch |
| Q11 | Where uploaded-file duration is extracted (server-side decode vs. client-side on add). | **Resolved: server-side mutagen at upload** (ADR-0006). | M1 |

## Resolved

- **R7 / Q11 — `duration_seconds` extraction.** File: server-side mutagen probe at upload (`info.length`), null on parse failure (upload still succeeds). YouTube: null at add-time, optional client-side `getDuration()` post-M1. Pure-Python dep, no ffmpeg binary. → [ADR-0006](adr/0006-file-duration-mutagen.md) · [research](research/duration-extraction.md).
