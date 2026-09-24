# PRD 01 — Sound Library

## Overview

The Sound Library is the GM's personal collection of audio. GMs add sounds (uploads or YouTube links), tag them, preview them, and reuse them across sets. Terms: see [CONTEXT.md](../../CONTEXT.md).

## Goals

- Add audio from two source types: uploaded file and YouTube link, behind one metadata-level audio-source abstraction.
- Organize by free-form tags.
- Preview any sound before using it.

## Requirements

### Adding sounds

- **Upload**: GM uploads an audio file; stored server-side (local disk behind a storage interface). One Sound per file.
- **YouTube link**: GM pastes a single-video URL.
  - Store **video ID + title + duration** (fetched via oEmbed at add-time; no API key). No thumbnail.
  - **Validate embeddability at add-time**; warn if the video blocks embedding / is restricted.
  - Playlists and start/end timestamps are **out of scope** (single video only).
- Every Sound belongs to exactly one User (multi-tenant model; see ADR-0002).

### Tags

- Free-form tags on each Sound.
- Tags drive tag-based sets (see PRD 03).
- Deleting a Tag removes it from its Sounds and Sets. The deletion flow gives no Set-specific
  impact message; a Set that loses its final Tag remains valid and appears as tagless in the
  Layers & Sets configuration workspace.

### Preview

- GM can play/stop any individual Sound in the library, independent of sets.

### Reuse

- A Sound can belong to **multiple sets**, including sets in **different layers**.
- Deleting a Sound removes it from all sets it was in (a set may become empty and stays).

### Playback failure

- A persistent YouTube IFrame playback error (codes `2`, `100`, `101`, or `150`) marks the Sound
  errored with a cause the GM can read. The server supplies the stored cause text; the client
  cannot edit it. The Library keeps the Sound visible, shows its cause, and offers **Recheck**.
  Errored Sounds remain in resolved Set membership; Session playback skips them (PRD 04).
- **Recheck** attempts to play that Sound in the Library. Only an IFrame `playing` event starts
  clearing its persisted error. A transient error, timeout, or stop before `playing` leaves it
  errored. If playback succeeds but the clear request fails, the preview may continue, while the
  Library keeps the errored badge and Sets keep skipping the Sound until the clear succeeds.
- YouTube code `5` and unknown codes, and all uploaded-file load/play failures, are transient
  playback failures. Show them to the GM for this attempt; never mark a file Sound errored or
  persist a transient failure.
- A failed mark or clear write produces a visible unsaved warning. Retry with backoff while the
  view is open and immediately on reconnect. Pending writes are not kept across reload; the
  server's stored state is what a fresh view reads. The browser serializes mark, clear, and retry
  writes per Sound and discards stale mark retries after successful Recheck.

## Out of scope (launch)

- Audio extraction from YouTube (legal); playlists; clip timestamps; source types beyond file/YouTube.

### Upload formats

- Accept **MP3, OGG (Vorbis/Opus), WAV, M4A/AAC, FLAC**; reject others at upload with a clear error.
- **No max file size** at launch (self-hosted; GM's own disk). Add a cap later only if it becomes necessary.

## Open questions

- _(none)_
