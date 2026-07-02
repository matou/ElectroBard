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

### Preview

- GM can play/stop any individual Sound in the library, independent of sets.

### Reuse

- A Sound can belong to **multiple sets**, including sets in **different layers**.
- Deleting a Sound removes it from all sets it was in (a set may become empty and stays).

### Playback failure

- YouTube video later unavailable/unembeddable → mark the Sound errored and skip it within a set; surface the error to the GM.

## Out of scope (launch)

- Audio extraction from YouTube (legal); playlists; clip timestamps; source types beyond file/YouTube.

### Upload formats

- Accept **MP3, OGG (Vorbis/Opus), WAV, M4A/AAC, FLAC**; reject others at upload with a clear error.
- **No max file size** at launch (self-hosted; GM's own disk). Add a cap later only if it becomes necessary.

## Open questions

- _(none)_
