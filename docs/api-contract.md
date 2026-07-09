# ElectroBard — API Contract

The REST surface the frontend talks to, grouped by resource and tagged with the milestone that
introduces it. This is an **inventory + conventions** doc; the authoritative, always-current
contract is FastAPI's generated **OpenAPI schema**, from which the typed client is built
(tech-stack). When the two disagree, OpenAPI wins — update this doc.

Entities: [data model](data-model.md). Build order: [roadmap](roadmap.md). Terms:
[glossary](../CONTEXT.md).

## Conventions

- **REST/JSON** over HTTP; resource-oriented paths under `/api`.
- **Auth stub** (ADR-0002): no auth header at launch; every request resolves to the single
  implicit current user server-side. Tenant scoping is applied by the server, not passed by the
  client. The header slot is added when real auth lands — no path changes expected.
- **IDs**: UUIDs in paths and bodies.
- **Errors**: consistent JSON `{ "detail": ... }` (FastAPI default); `422` for validation,
  `404` for missing/wrong-tenant, `409` for conflicts (e.g. duplicate tag name).
- **Playback is client-side.** There are **no** transport endpoints for play/stop/volume — the
  Program lives in the browser (ADR-0003). The API serves library/config data and file bytes
  only.
- **Timestamps** ISO-8601; **volume** as the model's `0–100` integer percent.

## Resources

### Sounds — M1 (PRD-01)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/sounds` | List the user's sounds. Query: `?tag=` (filter), `?q=` (name search, optional). |
| `POST` | `/api/sounds/upload` | Multipart file upload → one `file` Sound. Rejects non-allowed formats (`422`). |
| `POST` | `/api/sounds/youtube` | Body `{ url }`. Extracts the 11-char video ID (structural URL parse) + fetches keyless oEmbed `title` (**no** duration). Add-time embeddability is a heuristic on the oEmbed status: `200`→accept, `401`→accept-with-warning, `400`/`404`→reject (`422`). The authoritative verdict is the client IFrame `onError` (`101`/`150`) at playback, which flips `is_errored` (ADR-0005). |
| `GET` | `/api/sounds/{id}` | Fetch one. |
| `PATCH` | `/api/sounds/{id}` | Edit `name`; set tags (see below). |
| `DELETE` | `/api/sounds/{id}` | Delete Sound; removes its file via storage interface; membership updates for free (tag-derived). |
| `GET` | `/api/sounds/{id}/audio` | **`file` sounds only** — serve bytes for browser preview/playback via the storage interface. YouTube sounds play client-side through the IFrame API, no server hop. |

M1 preview needs **no seek** (play/stop only — prototype #21), so HTTP Range support is out of
scope for M1. But build this on a **range-capable** file response (`FileResponse` / static serving,
which emits `Accept-Ranges` + `206`), **not** a hand-rolled `200`-only stream — then adding a
scrubber later is a non-breaking, no-migration add rather than an endpoint rewrite.

`is_errored` sounds are returned (flagged) so the UI can surface and the session view can skip
them.

### Tags — M1 (PRD-01/03)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/tags` | List the user's tags. |
| `POST` | `/api/tags` | Create `{ name }`; `409` on duplicate per user. |
| `PATCH` | `/api/tags/{id}` | Rename. |
| `DELETE` | `/api/tags/{id}` | Delete; drops from all sounds and sets (a set may become empty and stays). |

Tag assignment on a Sound is done through `PATCH /api/sounds/{id}` (set the full tag list), so
membership recomputation has a single write path. (Dedicated
`PUT /api/sounds/{id}/tags/{tagId}` is an option if partial updates get noisy — deferred.)

### Layers — M2 (PRD-02)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/layers` | List in `position` order. Starter layers already seeded on first run. |
| `POST` | `/api/layers` | Create `{ name, playback_mode?, volume? }` (defaults: `single`, `0.80`). |
| `PATCH` | `/api/layers/{id}` | Edit `name`, `playback_mode`, `volume`. Live volume changes persist here. |
| `DELETE` | `/api/layers/{id}` | Delete layer and its sets (cascade). |
| `PATCH` | `/api/layers/reorder` | Body `{ orderedIds: [...] }` → set `position`. Single call keeps ordering atomic. |

### Sets — M2 config (PRD-03), consumed live in M3 (PRD-04)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/layers/{layerId}/sets` | Sets in a layer (display order). |
| `POST` | `/api/layers/{layerId}/sets` | Create `{ name, tagIds, loop?, shuffle? }`. |
| `GET` | `/api/sets/{id}` | Fetch one (incl. its tag list + settings). |
| `PATCH` | `/api/sets/{id}` | Edit `name`, `loop`, `shuffle`, `tagIds`, `position`. |
| `DELETE` | `/api/sets/{id}` | Delete set (sounds/tags untouched). |
| `GET` | `/api/sets/{id}/sounds` | **Resolved membership** — the sounds this set currently contains, in A→Z order (server resolves tags, OR semantics). The session view reads this to load a set; `?shuffle` ordering is a client runtime concern. |

`GET /api/sets/{id}/sounds` is the seam the roadmap calls out: membership is testable via the
API in M2, before any audio exists.

## What is intentionally absent

- **Playback / transport endpoints** — client-side Program (ADR-0003); no resume-on-reload.
- **`sound_set` membership writes** — sets are tag-based; no manual add/remove at launch.
- **Auth / user endpoints** — stubbed single user until the auth milestone.
- **Listener / broadcast / WebSocket** — post-MVP (ADR-0003).

## Open questions

In the [risks log](risks.md):

- Tag assignment via full-list `PATCH` vs. dedicated add/remove endpoints.
- Whether membership resolution returns full sound objects or IDs (payload size vs. round-trips).
- Upload flow for very large files (no size cap at launch) — streaming vs. buffered.
