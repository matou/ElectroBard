# YouTube "Add single video" flow — URL parsing, keyless metadata, embeddability

**Date:** 2026-07-08
**Scope:** `POST /api/sounds/youtube { url }`, no YouTube Data API key. Store video ID + title (+ maybe duration). Validate embeddability at add-time; playback later via the client IFrame Player API.

## Summary / recommendation

Extract the 11-char video ID by parsing the URL **structurally** (host + path + `v` query param), not with one mega-regex; strip playlist/radio params. For keyless metadata, hit YouTube's own oEmbed endpoint `https://www.youtube.com/oembed?url=<canonical watch URL>&format=json` — it returns `title`, `author_name`, `thumbnail_url` and an embed `<iframe>` HTML, but **no duration**. Empirically the oEmbed HTTP status is the add-time embeddability signal: **200 = exists + embeddable**, **401 = owner disabled embedding**, **400/404 = unusable** (malformed ID, deleted, nonexistent, or private — conflated). That signal is reliable enough to *warn*, not to fully validate: the definitive "owner disallows embedding" verdict (IFrame `onError` **101/150**) can only surface client-side at playback. Recommendation: **accept on 200; accept-with-warning on 401 (and on 400/404 either reject the URL as unusable or accept-with-warning); always defer the final word to the client**, which marks the Sound errored on `onError` 101/150/100.

---

## (1) URL forms + video-ID extraction

**Video ID:** exactly **11 characters**, charset **`[A-Za-z0-9_-]`** (base64url). Anything else is not a video ID. (The 11th char carries only 2 significant bits, so many 11-char strings are structurally invalid IDs — see the 400-vs-404 finding in section 2.)

**Single-video URL forms** (all confirmed to resolve to the same video via oEmbed — see section 2):

| Form | ID location |
|------|-------------|
| `youtube.com/watch?v=ID` (+ `&t=`, `&list=`, `&si=`, `&pp=`) | `v` query param |
| `youtu.be/ID` (+ `?t=`, `?si=`) | first path segment |
| `youtube.com/shorts/ID` | path segment after `/shorts/` |
| `youtube.com/embed/ID` | path segment after `/embed/` |
| `youtube.com/live/ID` | path segment after `/live/` |
| `youtube.com/v/ID` (legacy) | path segment after `/v/` |
| host variants: `www.`, no-www, `m.`, `music.` | (host doesn't affect extraction — extract ID the same way) |

**Recommended extraction strategy (structural, not one regex):**

1. Normalize: trim; if no scheme, prepend `https://`; parse with a real URL parser.
2. Lowercase the host; reject if host (after stripping leading `www.`/`m.`/`music.`) is not `youtube.com` or `youtu.be`.
3. Dispatch on host + first path segment:
   - host `youtu.be` -> candidate ID = first path segment.
   - path `/watch` -> candidate ID = `v` query param.
   - path starts with `/shorts/`, `/embed/`, `/live/`, `/v/` -> candidate ID = the segment after that prefix.
   - path `/playlist` -> **reject** (no single video; see pitfalls).
   - else -> reject (channel, `@handle`, `/results`, homepage, etc.).
4. Validate candidate against `^[A-Za-z0-9_-]{11}$`. Reject otherwise.
5. **Discard all other params** — `list`, `start_radio`, `index`, `t`, `si`, `pp`, `feature`. Persist only the canonical ID; reconstruct a canonical `https://www.youtube.com/watch?v=ID` for the oEmbed call.

**Pitfalls:**
- `watch?v=ID&list=...&start_radio=1` — a real video *inside* a playlist/radio. Keep the video ID, drop `list`/`start_radio`.
- `youtube.com/playlist?list=...` — **no `v`, no single video -> reject.** (oEmbed returns 400 for this.)
- Do a strict length/charset check; a `v` value like `dQw4w9WgXcQ&extra` only happens with sloppy regex — structural parsing avoids it.
- `youtu.be` path may carry a trailing `/` or extra segments from bad copy-paste — take only the first segment.

---

## (2) No-key oEmbed — `https://www.youtube.com/oembed?url=<URL>&format=json`

**Fields returned** (real response for `watch?v=dQw4w9WgXcQ`, empirically fetched 2026-07-08):

```json
{
  "title": "Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)",
  "author_name": "Rick Astley",
  "author_url": "https://www.youtube.com/@RickAstleyYT",
  "type": "video",
  "height": 113,
  "width": 200,
  "version": "1.0",
  "provider_name": "YouTube",
  "provider_url": "https://www.youtube.com/",
  "thumbnail_height": 360,
  "thumbnail_width": 480,
  "thumbnail_url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  "html": "<iframe width=\"200\" height=\"113\" src=\"https://www.youtube.com/embed/dQw4w9WgXcQ?feature=oembed\" frameborder=\"0\" allow=\"accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share\" referrerpolicy=\"strict-origin-when-cross-origin\" allowfullscreen title=\"...\"></iframe>"
}
```

The canonical video ID appears inside `html`'s iframe `src` (`.../embed/<ID>?feature=oembed`) and in `thumbnail_url` (`i.ytimg.com/vi/<ID>/...`), so oEmbed also serves as an ID canonicalizer. `format=xml` returns the same fields as XML.

**No duration.** Confirmed: the oEmbed response carries no `duration`/length field of any kind. Duration is **not** obtainable keylessly from oEmbed. (It surfaces client-side later via IFrame `player.getDuration()` once the video is cued, or would require the Data API `videos.list?part=contentDetails`, which needs a key.)

**HTTP status behavior — empirical observations (curl, 2026-07-08):**

| Case | Test input | Observed status | Body |
|------|-----------|-----------------|------|
| Public, embeddable | `dQw4w9WgXcQ` | **200** | JSON |
| Embedding disabled by owner | `s5qx1X78ujE` | **401 Unauthorized** | `Unauthorized` |
| Nonexistent (valid-format ID) | `00000000000`, `abcdefghijk` | **404 Not Found** | `Not Found` |
| Malformed / invalid ID | `aaaaaaaaaaa`, `dQw4w9WgXc1` | **400 Bad Request** | `Bad Request` |
| Playlist URL (no video) | `/playlist?list=...` | **400 Bad Request** | `Bad Request` |
| `/embed/<ID>` URL passed to oEmbed | `embed/dQw4w9WgXcQ` | **404 Not Found** | oEmbed doesn't accept `/embed/` URLs — pass a `watch`/`youtu.be` URL |

**Surprising empirical finding — 400 vs 404 tracks ID *checksum*, not deletion.** Two 11-char, valid-charset IDs behaved differently: `abcdefghijk` -> 404 but `dQw4w9WgXc1` -> 400; `00000000000` -> 404 but `aaaaaaaaaaa` -> 400. YouTube IDs are base64url of a 64-bit number, so the 11th char has only a few legal values; structurally-impossible IDs are rejected as **400** before lookup, structurally-valid-but-absent IDs return **404**. **Consequence: you cannot use 400-vs-404 to distinguish "deleted" from "never existed" from "private" — treat both as "unusable."**

**Region-blocked / private:** not empirically testable here (no stable public ID to reference), and **undocumented**. Reports across integrations indicate private videos return 401 *or* 404 depending on state, so 401 is *not* a clean "embedding disabled AND nothing else" signal — see section 3.

Host/scheme tolerance (all -> 200 for a good video): `www.`, no-www, `m.`, `music.`, `http://` (upgraded), `youtu.be`, `/shorts/`, `/live/`, and `watch` with extra `&list`/`&t` params. (One third-party report claims no-www -> 403, but current YouTube returns 200 for no-www; normalize to `www.` anyway to be safe.)

---

## (3) The key unknown — server-side embeddability at add-time, no key

**Does oEmbed 401/404 reliably signal "embedding disabled"?** Partly.
- **401 is the best keyless "embedding disabled by owner" signal available**, and it's reasonably specific: a normal, embeddable public video returns 200; a video whose owner unchecked "Allow embedding" returns 401 (confirmed empirically with `s5qx1X78ujE`, corroborated by multiple integration bug reports).
- **But 401 is not *guaranteed* to be embed-disabled alone.** oEmbed conflates embed-disabled with some private/age-restricted states, and it does **not** distinguish deleted vs private vs nonexistent (those land in 400/404, split by ID checksum, not by cause). So server-side you can distinguish **{embeddable} / {owner-blocked-or-restricted} / {unusable}** — three buckets — and no finer.

**What noembed.com (`https://noembed.com/embed?url=...`) changes:** It's a normalizing oEmbed proxy. Crucially it **returns HTTP 200 in all cases and surfaces failures as an `error` field in the JSON** instead of an HTTP status — empirically:
- good video -> normal JSON (guarantees `html`, `title`, `url`, `provider_name`; also gives `author_name`, `thumbnail_url`, etc.). **No duration** (same limitation).
- nonexistent -> `{"error":"404 Not Found","url":"..."}` (HTTP 200)
- embed-disabled -> `{"error":"401 Unauthorized","url":"..."}` (HTTP 200)

So noembed just re-encodes YouTube's status code into an `error` string — **no new information**, and it adds a third-party dependency/latency. It's convenient for JSONP/uniform parsing but adds nothing for embeddability detection. **Recommendation: call YouTube's oEmbed directly and read the HTTP status; skip noembed.**

**Detectable server-side (add-time, keyless) vs deferred to runtime:**

Detectable now:
- ID is well-formed (regex).
- Video *exists* and metadata is fetchable (oEmbed 200 -> we get `title`, `thumbnail_url`, `author_name`).
- A strong hint that embedding is disabled (oEmbed 401) or the URL is unusable (400/404).

Must be deferred to the client IFrame Player API at playback (`onError` event `event.data`):

| Code | Documented meaning | When it appears |
|------|--------------------|-----------------|
| **2** | Request contains an invalid parameter value — e.g. an ID that isn't 11 chars or has invalid characters. | Should never fire if server validated the ID. |
| **5** | Content can't be played in an HTML5 player (or another HTML5-player error). | Runtime only. |
| **100** | Video not found — removed (for any reason) or marked **private**. | Runtime; overlaps oEmbed 404. |
| **101** | **The owner of the requested video does not allow it to be played in embedded players.** | **Runtime only** — the authoritative embed-disabled verdict. |
| **150** | Same as 101 ("a 101 in disguise"). Owner disallows embedded playback. | **Runtime only.** |

101/150 are the ground truth for "owner disallows embedding," and they **only surface in the client at playback** — the server's oEmbed 401 is a *predictor* of them, not a substitute. (Also note IFrame error **153**: missing `HTTP Referer`/API-client identification — an embedding-context error, not a per-video property.)

**Recommendation for the add-time server check:**

1. Parse + validate the ID structurally (reject non-video URLs, playlists, bad IDs -> **400 to the API caller**).
2. Fetch `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=<ID>&format=json`. Branch on status:
   - **200** -> **accept.** Store `video_id`, `title`, `thumbnail_url` (and `author_name` if wanted). Duration unavailable -> leave null (fill client-side via `getDuration()` if desired).
   - **401** -> **accept with warning** ("embedding may be disabled by the owner; this sound may fail to play"). Store what you can; still let the user add it. Do **not** hard-reject — 401 is a heuristic, and the client is the final arbiter.
   - **400 / 404** -> the video is unusable (bad/deleted/private/nonexistent). **Reject** with a clear message ("video not found or unavailable"). (Optionally accept-with-warning if you'd rather never block on a keyless heuristic — but reject is the better UX here since there's no title to show.)
   - Network/5xx/timeout -> treat as transient: accept-with-warning or ask the user to retry; don't persist a bogus "errored" state from an infra blip.
3. **Defer the definitive check to the client.** On playback, the IFrame `onError` handler maps **101/150 -> embedding disabled**, **100 -> gone/private**, **2/5 -> unplayable**, and marks the Sound **errored** (feeds the separate "Errored-sound scope" decision). This client verdict should override an optimistic add-time 200, since embeddability can change after add-time.

---

## Sources

- YouTube IFrame Player API reference — `onError` codes 2/5/100/101/150 (and 153): https://developers.google.com/youtube/iframe_api_reference
- oEmbed spec (field names, `type`/`version`/`html` semantics): https://oembed.com/
- YouTube oEmbed endpoint — empirically probed 2026-07-08 (status codes 200/401/400/404 above are direct curl observations against `https://www.youtube.com/oembed`).
- noembed.com — endpoint + response guarantees (`html`,`title`,`url`,`provider_name`), JSONP `callback`: https://noembed.com/ ; error-field behavior empirically probed 2026-07-08.
- 401 = embedding-disabled corroboration: https://github.com/lycheeverse/lychee/issues/214 , https://github.com/extractus/oembed-extractor/issues/168 , https://core.trac.wordpress.org/ticket/14377
- Restrict-embedding (owner setting behind 401 / IFrame 101): https://support.google.com/youtube/answer/6301625
- Embed-disabled test video ID `s5qx1X78ujE` (reference): https://github.com/anxdpanic/plugin.video.youtube/issues/482
