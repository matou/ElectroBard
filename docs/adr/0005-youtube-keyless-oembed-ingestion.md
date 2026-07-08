# YouTube add-flow: keyless oEmbed ingestion; embeddability is a warn-only heuristic

Adding a YouTube sound (`POST /api/sounds/youtube { url }`) uses **no YouTube Data API key**. The server does two things: (1) extract the canonical 11-char video ID by parsing the URL **structurally** (host + path + `v` param, validated against `^[A-Za-z0-9_-]{11}$`), not with one mega-regex; (2) fetch metadata from YouTube's own **oEmbed** endpoint `https://www.youtube.com/oembed?url=<canonical watch URL>&format=json`, which returns `title`, `author_name`, `thumbnail_url` and an embed `<iframe>` — but **no duration**.

Add-time embeddability is decided from the oEmbed HTTP status, treated as a **heuristic, not a guarantee**: **200 → accept**, **401 → accept-with-warning** ("owner may have disabled embedding"), **400/404 → reject** ("video not found or unavailable"). The **authoritative** "owner disallows embedding" verdict is the IFrame Player API `onError` code **101/150**, which only surfaces **client-side at playback**; the client marks the Sound `is_errored` there (100 → gone/private; 2/5 → unplayable). Full findings + empirical status-code probes: [research/youtube-add-flow.md](../research/youtube-add-flow.md). Relates to [ADR-0001](0001-client-side-audio.md) (client-side playback) and risk R2.

## Consequences

- **No API key, no key management, no quota.** Self-hosters add YouTube sounds with zero credentials — the whole point of the keyless path. The cost is that duration and the definitive embed verdict are unavailable server-side.
- **`duration_seconds` stays null for YouTube at add-time.** oEmbed carries no duration and the keyless path can't get one; it's filled later client-side via IFrame `player.getDuration()` if wanted (data-model already models it nullable). No Data API dependency is introduced.
- **Embeddability is best-effort at add-time.** A 401-warned sound is still added (the user decides); a 200-accepted sound can still fail later (embeddability changes over time). The server's check catches the common cases early without ever being the final arbiter.
- **The client is the source of truth for playability.** `onError` 101/150/100 drives `is_errored` at runtime — the add-time result is only a hint and a 200 does not prevent a later errored flip. This hands the "when/how does a sound become errored" question to the separate Errored-sound scope decision.
- **No third-party proxy.** noembed.com was evaluated and rejected — it only re-encodes YouTube's status into a JSON `error` field (HTTP 200) and adds a dependency + latency with no new signal. Call YouTube oEmbed directly.
- **400↔404 carries no meaning to us.** The split tracks the video-ID base64 checksum, not deleted-vs-nonexistent-vs-private, so both are collapsed to a single "unusable → reject."

## Alternatives considered

- **YouTube Data API (`videos.list`, with key).** Gives exact `duration`, `status.embeddable`, and privacy state authoritatively. Rejected for launch: requires every self-hoster to provision and manage an API key + quota, contradicting the zero-config self-hosted goal. Revisit only if keyless metadata proves too thin.
- **noembed.com as the metadata source.** Uniform HTTP-200-with-`error`-field responses are convenient, but it adds a third-party hop and surfaces no information YouTube's own oEmbed lacks. Rejected.
- **Hard-reject on oEmbed 401 (treat as "not embeddable").** Rejected: 401 is a heuristic that conflates embed-disabled with some private/restricted states, and embeddability can't be fully known before playback anyway — warning and letting the user decide is the better UX than blocking on a guess.
- **One mega-regex for ID extraction.** Rejected: brittle across the watch/`youtu.be`/`shorts`/`embed`/`live` forms and prone to capturing junk (e.g. `v=ID&extra`); structural host+path parsing plus a strict `{11}` charset check is clearer and safer.
