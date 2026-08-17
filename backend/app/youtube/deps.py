"""oEmbed client dependency provider (mirrors `app.storage.deps.get_storage`)."""

from functools import lru_cache

from app.youtube.base import OEmbedClient
from app.youtube.oembed import YouTubeOEmbedClient


@lru_cache
def get_oembed_client() -> OEmbedClient:
    """Return the process-wide oEmbed client (real network calls to YouTube)."""
    return YouTubeOEmbedClient()
