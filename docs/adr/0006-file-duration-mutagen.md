# File duration via server-side mutagen probe; YouTube duration null at launch

Uploaded (`file`) Sounds get their `duration_seconds` (data-model) from a **server-side [mutagen](https://mutagen.readthedocs.io/) probe at upload time**: `mutagen.File(path).info.length` (float seconds), run synchronously in the `POST /api/sounds/upload` handler after format validation. mutagen is **pure Python with no dependency outside the standard library** and reads the value from the container/stream header (no full decode), covering exactly our accepted formats — MP3, OGG Vorbis/Opus, WAV, M4A/AAC, FLAC. If mutagen raises or returns no length (corrupt/misdeclared file), the handler **stores `NULL` and still accepts the upload** — duration is a library-UI nicety, never worth failing an upload.

`youtube` Sounds keep `duration_seconds` **null at add-time**, as already set by [ADR-0005](0005-youtube-keyless-oembed-ingestion.md): oEmbed has no duration and the keyless path won't provision a YouTube Data API key. Full findings + option comparison: [research/duration-extraction.md](../research/duration-extraction.md). Resolves risk R7 and open question Q11.

## Consequences

- **New backend dependency: `mutagen`.** Small, pure-Python, no system binary — installs cleanly under uv, no PATH/ffmpeg provisioning for self-hosters. This is the one cost.
- **`duration_seconds` is best-effort, not guaranteed.** It's populated for well-formed files, null for YouTube (until an optional client-side backfill) and for files mutagen can't parse. The field stays **nullable** and no feature may treat it as required.
- **No full decode, no size concern.** Header-only reads stay cheap even with no upload size cap (R4).
- **Duration miss ≠ upload failure.** Format acceptance is enforced separately via `content_type`; a duration miss is cosmetic and silent (logged).
- **YouTube track-length stays a later, client-side option.** IFrame `player.getDuration()` can backfill it post-M1 with no key and no server hop; not built in M1.

## Alternatives considered

- **ffprobe / ffmpeg.** Authoritative, but a **system binary** every self-hoster must install and keep on PATH — a full demuxer invoked for a length lookup mutagen does in-process. Rejected as heavyweight and contrary to the zero-config posture. Revisit only if a file mutagen can't read but ffprobe can becomes a real problem.
- **Client-side probe (browser reads `<audio>.duration`, POSTs it).** No server dependency, but the server already holds the bytes; a client-supplied number is untrusted, adds a round-trip and a validation path. Rejected.
- **YouTube Data API for YouTube duration.** Gives exact duration but **requires an API key** even for public reads (quota metering), breaking the keyless ingestion decision (ADR-0005). Rejected for launch; client-side `getDuration()` is the keyless alternative.
- **Leave file duration null too (defer entirely).** Simplest, but throws away a cheap, high-value UI detail we can get for free from bytes already on the server. Rejected — mutagen is light enough that there's no reason to defer the file case.
