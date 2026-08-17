"""Sounds router — the user's audio library (api-contract: Sounds).

`GET /api/sounds` and `GET /api/sounds/{id}` are the real read surface over the Sound
model (#35), replacing the M0 walking-skeleton stub. Every payload carries `is_errored`
+ `error_detail` — the errored read-contract (#25): flagged, never hidden, and there is
no `?errored=` filter. `POST /api/sounds/upload` (#36) is the file ingestion path.
Mounted under `/api` by the app factory.
"""

from io import BytesIO
from uuid import UUID

import mutagen
from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import Sound, SoundKind, Tag, User
from app.schemas.sound import SoundRead
from app.storage import Storage, get_storage

router = APIRouter(tags=["sounds"])

# Extension (lower-cased, no dot) -> canonical content-type. The single source of
# truth for accepted upload formats and their stored `content_type` (api-contract
# "Upload ingestion", #22): the client-declared Content-Type is never trusted, since
# browser audio MIME is inconsistent across formats/platforms.
_EXTENSION_CONTENT_TYPES: dict[str, str] = {
    "mp3": "audio/mpeg",
    "ogg": "audio/ogg",
    "wav": "audio/wav",
    "m4a": "audio/mp4",
    "flac": "audio/flac",
}


def _probe_duration_seconds(data: bytes) -> int | None:
    """Best-effort duration probe via mutagen (ADR-0006).

    Reads header-only metadata, no full decode. Any failure to identify or read the
    file is *not* an upload error — a duration miss is a cosmetic nicety, so this
    always returns `None` rather than raising.
    """
    try:
        audio = mutagen.File(BytesIO(data))
    except Exception:
        return None
    if audio is None or audio.info is None or audio.info.length is None:
        return None
    return int(round(audio.info.length))


# Handlers below return ORM `Sound` objects, not `SoundRead`; FastAPI serializes them
# through `response_model` (Pydantic's `from_attributes`) at the response boundary.


@router.get("/sounds", response_model=list[SoundRead])
def list_sounds(
    tag: UUID | None = None,
    q: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Sound]:
    """List the current user's sounds, A-Z by name.

    `?tag=` filters to sounds carrying that tag id; `?q=` is an optional
    case-insensitive substring search on `name`. Both are scoped to the current user.
    """
    stmt = select(Sound).where(Sound.user_id == current_user.id).order_by(Sound.name)
    if tag is not None:
        stmt = stmt.join(Sound.tags).where(Tag.id == tag)
    if q is not None:
        stmt = stmt.where(Sound.name.ilike(f"%{q}%"))
    return list(db.scalars(stmt).all())


@router.get("/sounds/{sound_id}", response_model=SoundRead)
def get_sound(
    sound_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Sound:
    """Fetch one sound. 404 if missing or owned by another user."""
    sound = db.scalar(select(Sound).where(Sound.id == sound_id, Sound.user_id == current_user.id))
    if sound is None:
        raise HTTPException(status_code=404, detail="Sound not found")
    return sound


@router.post("/sounds/upload", response_model=SoundRead, status_code=status.HTTP_201_CREATED)
async def upload_sound(
    file: UploadFile,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
) -> Sound:
    """Multipart upload -> one `file` Sound (api-contract "Upload ingestion", #22).

    Format is validated by the filename's extension against a fixed allowlist — the
    client's declared Content-Type is never trusted. The upload is buffered fully
    (no streaming, Q6) and handed to the bytes-only storage seam. The Sound row is
    created and flushed first to mint its UUID (so `storage_key` can embed it), and
    the whole handler runs in `get_db`'s single request transaction: if `storage.save`
    raises, the exception propagates and that transaction rolls back, leaving no
    orphan row.
    """
    stem, dot, ext = (file.filename or "").rpartition(".")
    content_type = _EXTENSION_CONTENT_TYPES.get(ext.lower()) if dot else None
    if content_type is None:
        allowed = ", ".join(sorted(_EXTENSION_CONTENT_TYPES))
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported or missing file extension; allowed: {allowed}",
        )

    data = await file.read()

    sound = Sound(
        user_id=current_user.id,
        name=stem or "Untitled",
        kind=SoundKind.FILE,
        content_type=content_type,
    )
    db.add(sound)
    db.flush()  # mint sound.id before deriving the storage key

    sound.storage_key = f"sounds/{sound.id}.{ext.lower()}"
    sound.duration_seconds = _probe_duration_seconds(data)

    storage.save(sound.storage_key, data)

    return sound
