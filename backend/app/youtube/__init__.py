"""YouTube add-flow: video-ID extraction + the keyless oEmbed seam (ADR-0005)."""

from app.youtube.base import AddOutcome, OEmbedClient, OEmbedResult, classify_oembed_status
from app.youtube.deps import get_oembed_client
from app.youtube.url import extract_video_id

__all__ = [
    "AddOutcome",
    "OEmbedClient",
    "OEmbedResult",
    "classify_oembed_status",
    "extract_video_id",
    "get_oembed_client",
]
