# Prototype: Sound Library — the GM's backstage cabinet

A Sound Library screen prototype (PRD-01), built with `/prototype` +
`frontend-design`. **Throwaway** — it exists to force four backend decisions,
not to be promoted as-is. See [issue #21](../../docs/prd/01-sound-library.md).

## The idea

Sibling to the [session-view "cue console"](../session-view/) prototype — same
ElectroBard family (warm candlelit ink, mono-for-the-machine + serif-for-titles)
but calmer. The Session View is the **live board**; the Library is **backstage**
— where the GM gathers, tags, previews and repairs sounds *between* sessions.

**Signature: the source sigil.** Every Sound wears a stamped disc encoding its
origin and state in one glance — an amber waveform for an uploaded file, a red
play-triangle for a YouTube link; it rings green while previewing and is struck
with a crack + red ring when errored. One mark carries both the audio-source
abstraction (CONTEXT.md) and playback state.

## Chosen direction: Catalog rows

This started as three variants (Catalog rows / Sound cards / Index+detail), each
betting differently on four backend pressures. The GM picked **Catalog rows** — a
dense ledger, one Sound per row — and the other variants were removed to keep the
repo clean. The four pressures resolved as (full write-up in [`NOTES.md`](NOTES.md)):

| Pressure | Resolution | Backend consequence |
|---|---|---|
| **Duration in list** | shown as a column | needs **upload duration extraction** (R7 / Q11) |
| **Preview seek** | **No** — play/stop + progress bar | `GET /audio` needs **no HTTP Range** |
| **Errored sound** | inline in the row | `is_errored` + reason + recheck; no separate section |
| **Blocked YouTube** | inline warn + **"Add anyway"** | saved as errored → **blocked ≡ errored**, one path |

Net: the lightest, internally-consistent backend of the three directions.

## What it shows (from PRD-01)

Add file · add YouTube (with the blocked-embedding warning) · free-form tag
editing · preview play/stop · delete · and an **errored** sound surfaced inline.
Sample library spans both source types with realistic GM content and one errored
YouTube sound.

## What it deliberately does NOT do

- **No audio plays.** Preview is faked (the progress bar animates).
- **No server, no persistence.** In-memory; reload resets. Add/delete/tag are
  visual stubs.

## How to use

```
open prototypes/sound-library/index.html
```

No build, no deps, no network.
