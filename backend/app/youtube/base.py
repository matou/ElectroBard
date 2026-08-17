"""The oEmbed seam (mirrors `app.storage.base`): interface + shared value types.

`OEmbedClient` is the injected boundary — call sites depend on this abstract
interface and on `OEmbedResult`/`AddOutcome`, never on how metadata is actually
fetched, so tests inject a fake and only `YouTubeOEmbedClient` (oembed.py) ever talks
to the network.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import StrEnum


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


class AddOutcome(StrEnum):
    """The three add-time buckets an oEmbed status collapses to
    (docs/research/youtube-add-flow.md section 3): embeddable,
    owner-blocked-or-restricted, unusable.
    """

    ACCEPT = "accept"
    WARN = "warn"
    REJECT = "reject"


def classify_oembed_status(status_code: int) -> AddOutcome:
    """Map an oEmbed HTTP status to an add-time outcome (ADR-0005).

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
