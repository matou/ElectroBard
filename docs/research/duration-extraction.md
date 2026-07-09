# `duration_seconds` extraction — where it comes from (Q11 / R7)

**Date:** 2026-07-09
**Scope:** How the `Sound.duration_seconds` field (data-model) is populated for each `kind`. Ticket [#23](https://github.com/matou/ElectroBard/issues/23), part of the M1 decision map [#20](https://github.com/matou/ElectroBard/issues/20).

## Summary / recommendation

`duration_seconds` is **nullable and best-effort** — a nicety for the library UI (track length), never a required field.

- **`file` sounds:** extract server-side at upload with **[mutagen](https://mutagen.readthedocs.io/)** (`file.info.length`, a float in seconds). Pure-Python, zero system-binary dependency, covers exactly our accepted upload formats. Populate synchronously in the upload handler; on any parse failure, **leave it null and still accept the upload** — duration is never worth failing an upload over. This closes R7.
- **`youtube` sounds:** stays **null at add-time** — settled in [ADR-0005](../adr/0005-youtube-keyless-oembed-ingestion.md): oEmbed carries no duration and the keyless path won't provision a Data API key. If wanted later, fill it **client-side** via the IFrame Player API `player.getDuration()` (post-M1, no server work, no key).

Net: files get a duration at add-time; YouTube gets one only later and only client-side. The field stays nullable to absorb both the YouTube case and mutagen parse failures.

---

## (1) File duration — the options

| Option | Dependency | How | Verdict |
|---|---|---|---|
| **mutagen** (chosen) | pip, **pure Python, no external binary** ([docs](https://mutagen.readthedocs.io/en/latest/): "no dependencies outside the Python standard library", Py 3.10+) | Read container header → `MutagenFile(path).info.length` → float seconds | **Chosen.** Lightest thing that works; matches the accepted format set exactly. |
| **ffprobe** (ffmpeg) | **system binary** must be installed + on PATH | Shell out, parse `format.duration` | Rejected — heavyweight binary dependency for a header read we can do in-process; contradicts the zero-config self-hosted posture. Overkill (full demuxer for a length lookup). |
| **client-side probe** | none server-side | Browser loads the file into an `<audio>`/Web Audio element, reads `.duration`, sends it up | Rejected — the server already has the bytes; a client-supplied number is untrusted, adds a round-trip and client complexity, and needs a validation path. |

### mutagen format coverage vs. our accepted formats

Accepted upload formats (PRD-01 / data-model `content_type`): **MP3, OGG (Vorbis/Opus), WAV, M4A/AAC, FLAC**. mutagen covers **all five**, each exposing `info.length` in seconds:

| Format | mutagen class | `info.length` |
|---|---|---|
| MP3 | `mutagen.mp3.MP3` | ✅ seconds (float) |
| OGG Vorbis | `mutagen.oggvorbis.OggVorbis` | ✅ |
| OGG Opus | `mutagen.oggopus.OggOpus` | ✅ |
| WAV | `mutagen.wave.WAVE` | ✅ ("audio length, in seconds", float — [wave API](https://mutagen.readthedocs.io/en/latest/api/wave.html)) |
| M4A/AAC | `mutagen.mp4.MP4` | ✅ |
| FLAC | `mutagen.flac.FLAC` | ✅ |

`mutagen.File(path)` sniffs the type and returns the right class, so the handler needs one call, not per-format branching. `.info.length` is derived from the container/stream header (sample count ÷ sample rate, or a header field) — **no full decode**, so it's cheap even on large files (relevant given no upload size cap, R4).

**Failure mode:** a corrupt/truncated/misdeclared file makes mutagen raise (`MutagenError`) or return `None`. Catch it, log, and store `duration_seconds = NULL`. The upload still succeeds — format acceptance is already validated separately by `content_type` (data-model), so a duration miss is cosmetic.

## (2) YouTube duration — why null at launch

- **oEmbed** (`https://www.youtube.com/oembed`) returns `title`, `author_name`, `thumbnail_url`, embed HTML — confirmed in [research/youtube-add-flow.md](youtube-add-flow.md) — but **no duration**.
- The **YouTube Data API v3** *does* give it: `videos.list?part=contentDetails` → `contentDetails.duration` as an ISO-8601 string (e.g. `PT15M33S`) ([docs](https://developers.google.com/youtube/v3/docs/videos)). **But it requires an API key** even for public reads (the key meters quota; keyless `videos.list` calls are rejected — [getting-started](https://developers.google.com/youtube/v3/getting-started)). Adopting it would break the keyless ingestion decision (ADR-0005) — its whole point is zero credentials for self-hosters.
- **Client-side `player.getDuration()`** (IFrame Player API) yields the duration once the player is ready, with no key and no server hop. This is the sanctioned later path if YouTube track-length in the library is ever wanted; out of scope for M1.

## Decision

1. **File:** server-side mutagen probe at upload; null on parse failure, upload still succeeds. (New dep: `mutagen`.)
2. **YouTube:** null at add-time (ADR-0005); optional client-side `getDuration()` backfill post-M1. No Data API, no key.
3. `duration_seconds` remains **nullable, best-effort** for both kinds.

→ Folded into [data-model](../data-model.md), [api-contract](../api-contract.md), [ADR-0006](../adr/0006-file-duration-mutagen.md); R7 + Q11 struck in [risks](../risks.md).

## Sources

- mutagen docs — <https://mutagen.readthedocs.io/en/latest/> · [wave API](https://mutagen.readthedocs.io/en/latest/api/wave.html) · [base API](https://mutagen.readthedocs.io/en/latest/api/base.html)
- YouTube Data API v3 — [videos resource](https://developers.google.com/youtube/v3/docs/videos) · [getting started (auth)](https://developers.google.com/youtube/v3/getting-started)
- [research/youtube-add-flow.md](youtube-add-flow.md) · [ADR-0005](../adr/0005-youtube-keyless-oembed-ingestion.md)
