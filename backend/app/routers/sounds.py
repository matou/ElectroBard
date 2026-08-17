"""Sounds router — the user's audio library (api-contract: Sounds).

`GET /api/sounds` and `GET /api/sounds/{id}` are the real read surface over the Sound
model (#35), replacing the M0 walking-skeleton stub. Every payload carries `is_errored`
+ `error_detail` — the errored read-contract (#25): flagged, never hidden, and there is
no `?errored=` filter. `POST /api/sounds/upload` (#36) is the file ingestion path;
`POST /api/sounds/youtube` (#37) is the keyless YouTube ingestion path (ADR-0005).
`GET /api/sounds/{id}/audio` (#40) serves `file` sound bytes for in-browser preview;
YouTube sounds play client-side via the IFrame API, no server hop.
Mounted under `/api` by the app factory.
"""

import logging
import os
import tempfile
from io import BytesIO
from uuid import UUID

import mutagen
from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from app.db import get_db
from app.deps import get_current_user
from app.models import Sound, SoundKind, Tag, User
from app.schemas.sound import SoundRead, YoutubeAddRequest, YoutubeSoundRead
from app.storage import Storage, StorageObjectNotFound, get_storage
from app.youtube import (
    AddOutcome,
    OEmbedClient,
    classify_oembed_status,
    extract_video_id,
    get_oembed_client,
)

logger = logging.getLogger(__name__)

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
    always returns `None` rather than raising, but is logged per ADR-0006 ("silent
    and logged").
    """
    try:
        audio = mutagen.File(BytesIO(data))
    except Exception:
        logger.warning("mutagen raised while probing upload duration", exc_info=True)
        return None
    if audio is None or audio.info is None or audio.info.length is None:
        logger.warning("mutagen could not determine a duration for this upload")
        return None
    return int(round(audio.info.length))


# `list_sounds`/`get_sound`/`upload_sound` below return ORM `Sound` objects, not
# `SoundRead`; FastAPI serializes them through `response_model` (Pydantic's
# `from_attributes`) at the response boundary. `add_youtube_sound` is the one
# exception — it builds `YoutubeSoundRead` directly, since `embed_warning` has no
# backing column for `from_attributes` to read.


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


@router.get("/sounds/{sound_id}/audio", response_class=FileResponse)
def get_sound_audio(
    sound_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
) -> FileResponse:
    """Serve a `file` sound's bytes for in-browser preview (#40).

    `404` if the sound is missing/wrong-tenant, isn't a `file` sound (YouTube plays
    client-side, no server hop), or its blob is gone from storage.

    The bytes-only `Storage` seam (ADR-0001) has no notion of a servable path, so the
    response is built on a temp-file copy rather than streaming `storage.get`'s bytes
    by hand: `FileResponse` is what gives a real `Accept-Ranges`/`206` file response
    for free, matching the api-contract's "range-capable, not hand-rolled" note — a
    future scrubber can add `Range` requests with no endpoint rewrite. The temp file is
    unlinked via a background task once the response finishes sending.
    """
    sound = db.scalar(select(Sound).where(Sound.id == sound_id, Sound.user_id == current_user.id))
    if sound is None or sound.kind != SoundKind.FILE or sound.storage_key is None:
        raise HTTPException(status_code=404, detail="Sound not found")

    try:
        data = storage.get(sound.storage_key)
    except StorageObjectNotFound:
        raise HTTPException(status_code=404, detail="Sound not found") from None

    tmp = tempfile.NamedTemporaryFile(delete=False)
    try:
        tmp.write(data)
    except BaseException:
        tmp.close()
        os.unlink(tmp.name)
        raise
    tmp.close()

    return FileResponse(
        tmp.name,
        media_type=sound.content_type or "application/octet-stream",
        background=BackgroundTask(os.unlink, tmp.name),
    )


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


# Shown to the client alongside a still-created Sound when the add-time heuristic
# warns rather than rejects (ADR-0005) — never a guarantee either way. 401 is
# YouTube's own signal; anything else lumped into WARN (5xx, network/timeout) is an
# infra blip on *our* side, not a signal from YouTube, so it gets different copy.
_EMBED_WARNING_DISABLED = (
    "YouTube reports this video's embedding may be restricted; it may fail to play."
)
_EMBED_WARNING_UNVERIFIED = (
    "Could not verify this video's embeddability right now; it may fail to play."
)


@router.post(
    "/sounds/youtube", response_model=YoutubeSoundRead, status_code=status.HTTP_201_CREATED
)
def add_youtube_sound(
    body: YoutubeAddRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    oembed: OEmbedClient = Depends(get_oembed_client),
) -> YoutubeSoundRead:
    """`{ url }` -> one `youtube` Sound, keyless (ADR-0005, api-contract "Sounds").

    The video ID is extracted by structural URL parse (no API key); metadata comes
    from YouTube's own oEmbed endpoint, which carries a title but never a duration —
    `duration_seconds` stays null (client `getDuration()` backfill is post-M1).
    Add-time embeddability is a *heuristic* on the oEmbed status, not the final
    verdict (that's the client IFrame `onError` at playback, M3/#25): 200 accepts,
    401 still accepts but flags `embed_warning`, and 400/404 reject as unusable.
    """
    video_id = extract_video_id(body.url)
    if video_id is None:
        raise HTTPException(status_code=422, detail="Could not find a YouTube video ID in this URL")

    result = oembed.fetch(video_id)
    outcome = classify_oembed_status(result.status_code)
    if outcome is AddOutcome.REJECT:
        raise HTTPException(status_code=422, detail="Video not found or unavailable")

    sound = Sound(
        user_id=current_user.id,
        name=result.title or "Untitled",
        kind=SoundKind.YOUTUBE,
        youtube_video_id=video_id,
    )
    db.add(sound)
    db.flush()  # populate id/created_at for the response

    response = YoutubeSoundRead.model_validate(sound)
    if outcome is AddOutcome.WARN:
        response.embed_warning = (
            _EMBED_WARNING_DISABLED if result.status_code == 401 else _EMBED_WARNING_UNVERIFIED
        )
    return response
