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
| `POST` | `/api/sounds/upload` | Multipart file upload → one `file` Sound. Rejects non-allowed formats (`422`). Probes `duration_seconds` server-side via mutagen; null (not an error) if unparseable (ADR-0006). |
| `POST` | `/api/sounds/youtube` | Body `{ url }`. Extracts the 11-char video ID (structural URL parse) + fetches keyless oEmbed `title` (**no** duration). Add-time embeddability is a heuristic on the oEmbed status: `200`→accept, `401`→accept-with-warning, `400`/`404`→reject (`422`). The authoritative verdict is the client IFrame `onError` (`101`/`150`) at playback, which flips `is_errored` (ADR-0005). |
| `GET` | `/api/sounds/{id}` | Fetch one. |
| `PATCH` | `/api/sounds/{id}` | Edit `name`; set tags (see below). |
| `DELETE` | `/api/sounds/{id}` | Delete Sound; removes its file via storage interface; membership updates for free (tag-derived). |
| `GET` | `/api/sounds/{id}/audio` | **`file` sounds only** — serve bytes for browser preview/playback via the storage interface. YouTube sounds play client-side through the IFrame API, no server hop. |

M1 preview needs **no seek** (play/stop only — prototype #21), so HTTP Range support is out of
scope for M1. But build this on a **range-capable** file response (`FileResponse` / static serving,
which emits `Accept-Ranges` + `206`), **not** a hand-rolled `200`-only stream — then adding a
scrubber later is a non-breaking, no-migration add rather than an endpoint rewrite.

**Errored sounds — M1 read-only (resolved, #25).** Every Sound payload (`GET /api/sounds` list
**and** `GET /api/sounds/{id}`) carries `is_errored` (bool) + `error_detail` (string|null); errored
sounds are returned **flagged, never hidden**, and there is **no** `?errored=` filter (additive
later if wanted). M1 exposes these fields for reading only — **nothing in M1 writes
`is_errored=true`**: add-time only warns/rejects (#24), so an M1 sound is always `is_errored=false`
in practice. The authoritative errored verdict is the client IFrame `onError` at **playback**, so
the write path (the persist endpoint + the `onError`-code → `error_detail` vocabulary), the
skip-in-set logic, the UI badge, and any recover/un-error affordance all ship in **M3** as one
slice. Roles: `is_errored` = machine skip-flag; `error_detail` = human-readable sentence for GM
display (no structured code space at M1). Only the YouTube playback path ever sets it — file sounds
are never errored at launch.

#### `POST /api/sounds/upload` — ingestion (resolved, #22)

Multipart form, single field `file`.

- **Validation — extension sniff, allowlist.** The file's **extension** (case-insensitive) is
  mapped through a fixed allowlist to a canonical content-type: `mp3→audio/mpeg`,
  `ogg→audio/ogg`, `wav→audio/wav`, `m4a→audio/mp4`, `flac→audio/flac`. Missing filename, no
  extension, or an extension not in the allowlist → **`422`** (`detail` names the allowed set).
  The client `Content-Type` is **not** trusted (browser audio MIME is inconsistent); the
  allowlist is the single source of the stored `content_type`. Magic-byte sniffing was
  considered and rejected — it adds a dependency and still can't self-disambiguate audio
  subtypes (Vorbis/Opus in OGG, AAC/ALAC in M4A) without the extension; the trusted
  single-user threat model doesn't need it. Add it later (non-breaking) only if mislabeled
  uploads bite.
- **Transfer — buffered.** The upload is read fully (`await file.read()`) and handed to the
  bytes-only `Storage.save(key, data)` seam (ADR-0001). No streaming/`save_stream` at launch:
  realistic audio is ~3–100 MB, and buffering one copy on a self-hosted box is a non-issue.
  This keeps the storage seam at its deliberate width; revisit streaming **together with** a
  size cap (R4) if very large uploads ever land. (Q6 resolved.)
- **Persistence.** Create the `Sound` row first to mint its UUID, derive
  `storage_key = sounds/{id}.{ext}` (blob reuses the PK — a file on disk maps 1:1 to its
  Sound), `save`, then commit in **one transaction** so a failed save leaves no orphan row.
  `content_type` = the canonical value above. `name` seeds from the original filename with the
  extension stripped (`rain_loop.mp3 → rain_loop`, GM-editable; empty → `Untitled`).
  `duration_seconds` is probed here server-side via mutagen (null if unparseable, upload still
  succeeds — ADR-0006, #23).
- **Response** `201 Created` with the full created Sound (UI renders the new row without a
  refetch).
- **Dependency.** Parsing `UploadFile`/multipart requires the `python-multipart` package (not
  yet in backend deps) — add it with this endpoint.

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
