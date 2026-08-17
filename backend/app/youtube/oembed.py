"""Keyless YouTube oEmbed client + the add-time embeddability heuristic (ADR-0005).

`OEmbedClient` is the injected seam (mirrors `app.storage.Storage`): call sites depend
on the abstract interface, tests inject a fake, only `YouTubeOEmbedClient` talks to the
network. Add-time embeddability is decided from the oEmbed HTTP status alone — a
heuristic, not a guarantee (docs/research/youtube-add-flow.md section 3): the
authoritative "owner disallows embedding" verdict only surfaces client-side at
playback (IFrame `onError` 101/150, M3/#25).
"""

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import StrEnum

import httpx

logger = logging.getLogger(__name__)

_OEMBED_ENDPOINT = "https://www.youtube.com/oembed"
_REQUEST_TIMEOUT_SECONDS = 5.0


@dataclass(frozen=True)
class OEmbedResult:
    """Raw oEmbed outcome for one video ID.

    `status_code` is 0 for a network failure/timeout (no real HTTP status exists);
    `title` is populated only when the response was 200 with a parseable JSON body.
    """

    status_code: int
    title: str | None


class OEmbedClient(ABC):
    """Fetch keyless oEmbed metadata for one YouTube video ID."""

    @abstractmethod
    def fetch(self, video_id: str) -> OEmbedResult:
        """Return the oEmbed outcome for `video_id`. Never raises for HTTP-level or
        network failures — those are reported through `OEmbedResult`, not exceptions,
        since a failed fetch is a normal, expected branch of the add flow, not an
        error condition.
        """


class YouTubeOEmbedClient(OEmbedClient):
    """Calls YouTube's own oEmbed endpoint directly — no API key, no third-party
    proxy (ADR-0005 rejects noembed.com: it only re-encodes the same status as a
    JSON `error` field, adding a dependency for no new signal).
    """

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


class AddOutcome(StrEnum):
    """The three add-time buckets an oEmbed status collapses to (research doc
    section 3): embeddable, owner-blocked-or-restricted, unusable.
    """

    ACCEPT = "accept"
    WARN = "warn"
    REJECT = "reject"


def classify_oembed_status(status_code: int) -> AddOutcome:
    """Map an oEmbed HTTP status to an add-time outcome.

    200 -> accept. 400/404 -> reject (bad/deleted/private/nonexistent, indistinguishable
    -- research doc section 2). Everything else -- 401 (embedding likely disabled),
    5xx, and 0 (network/timeout) -- warns rather than blocks: 401 is a heuristic, and a
    transient infra blip must never read as "video unusable."
    """
    if status_code == 200:
        return AddOutcome.ACCEPT
    if status_code in (400, 404):
        return AddOutcome.REJECT
    return AddOutcome.WARN
