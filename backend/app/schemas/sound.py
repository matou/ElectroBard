"""Sound API schemas (api-contract.md → Sounds).

`SoundRead` is the full library-entry payload every Sounds endpoint returns (read and
write alike), read straight off the ORM object. It always carries `is_errored` +
`error_detail` — the M1 errored read-contract (#25): every payload is flagged, never
hidden, even though nothing in M1 ever writes `is_errored=true`.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.sound import SoundKind


class SoundRead(BaseModel):
    """A single library entry as returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    kind: SoundKind
    duration_seconds: int | None
    is_errored: bool
    error_detail: str | None
    youtube_video_id: str | None
    content_type: str | None
    created_at: datetime


class YoutubeAddRequest(BaseModel):
    """Body of `POST /api/sounds/youtube`."""

    url: str


class YoutubeSoundRead(SoundRead):
    """`POST /api/sounds/youtube`'s response: a `SoundRead` plus the add-time
    embeddability warning (ADR-0005). Non-null only when the oEmbed heuristic
    returned a 401 ("owner may have disabled embedding") — the sound is still
    created, but the client can use this to show an "Add anyway"-style notice.
    """

    embed_warning: str | None = None


class SoundPatchRequest(BaseModel):
    """Body of `PATCH /api/sounds/{id}`: rename + set the full tag list.

    `tag_ids` always replaces the whole tag set (Q4 — the single membership-recompute
    write path, no dedicated add/remove endpoints); an empty list clears all tags.
    """

    name: str
    tag_ids: list[UUID]
