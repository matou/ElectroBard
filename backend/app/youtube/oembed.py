"""`YouTubeOEmbedClient` — the real, network-hitting `OEmbedClient` (ADR-0005).

Calls YouTube's own oEmbed endpoint directly — no API key, no third-party proxy
(ADR-0005 rejects noembed.com: it only re-encodes the same status as a JSON `error`
field, adding a dependency for no new signal).
"""

import logging

import httpx

from app.youtube.base import OEmbedClient, OEmbedResult

logger = logging.getLogger(__name__)

_OEMBED_ENDPOINT = "https://www.youtube.com/oembed"
_REQUEST_TIMEOUT_SECONDS = 5.0


class YouTubeOEmbedClient(OEmbedClient):
    def fetch(self, video_id: str) -> OEmbedResult:
        canonical_url = f"https://www.youtube.com/watch?v={video_id}"
        try:
            response = httpx.get(
                _OEMBED_ENDPOINT,
                params={"url": canonical_url, "format": "json"},
                timeout=_REQUEST_TIMEOUT_SECONDS,
            )
        except httpx.RequestError:
            logger.warning("oEmbed request failed (network/timeout)", exc_info=True)
            return OEmbedResult(status_code=0, title=None)

        title: str | None = None
        if response.status_code == 200:
            try:
                title = response.json().get("title")
            except ValueError:
                logger.warning("oEmbed 200 response was not valid JSON", exc_info=True)
        return OEmbedResult(status_code=response.status_code, title=title)
