"""YouTube video-ID extraction — structural URL parse, no API key (ADR-0005).

Dispatches on host + path shape rather than one mega-regex (brittle across the
`watch`/`youtu.be`/`shorts`/`embed`/`live` forms, prone to capturing junk like a `v`
value glued to a trailing `&extra`). See docs/research/youtube-add-flow.md section 1.
"""

import re
from urllib.parse import parse_qs, urlparse

# YouTube IDs are 11 chars of base64url. This also rejects structurally-impossible
# candidates a sloppy regex would accept (research doc section 1, pitfalls).
_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")

# Stripped before host comparison; host doesn't affect extraction once removed.
_HOST_PREFIXES_TO_STRIP = ("www.", "m.", "music.")

# path-prefix -> nothing else needed; the candidate ID is the first segment after it.
_PATH_ID_PREFIXES = ("/shorts/", "/embed/", "/live/", "/v/")


def extract_video_id(url: str) -> str | None:
    """Return the 11-char video ID from a single-video YouTube URL, or `None`.

    `None` covers every "not a usable single-video URL" case alike: malformed URL,
    wrong host, playlist/channel/homepage links, and a candidate that fails the
    strict ID charset/length check. Callers turn `None` into a `422`.
    """
    raw = url.strip()
    if not raw:
        return None
    if "://" not in raw:
        raw = f"https://{raw}"

    try:
        parsed = urlparse(raw)
    except ValueError:
        return None

    host = (parsed.hostname or "").lower()
    for prefix in _HOST_PREFIXES_TO_STRIP:
        if host.startswith(prefix):
            host = host[len(prefix) :]
            break

    candidate: str | None = None
    if host == "youtu.be":
        segments = [s for s in parsed.path.split("/") if s]
        candidate = segments[0] if segments else None
    elif host == "youtube.com":
        if parsed.path == "/watch":
            values = parse_qs(parsed.query).get("v")
            candidate = values[0] if values else None
        else:
            for prefix in _PATH_ID_PREFIXES:
                if parsed.path.startswith(prefix):
                    rest = parsed.path[len(prefix) :]
                    candidate = rest.split("/")[0] if rest else None
                    break
            # Anything else (playlist, channel, @handle, homepage, ...) -> reject.
    else:
        return None

    if candidate is None or not _VIDEO_ID_RE.match(candidate):
        return None
    return candidate
