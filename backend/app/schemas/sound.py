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
