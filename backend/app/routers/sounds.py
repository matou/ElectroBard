"""Sounds router — the user's audio library (api-contract: Sounds).

`GET /api/sounds` and `GET /api/sounds/{id}` are the real read surface over the Sound
model (#35), replacing the M0 walking-skeleton stub. Every payload carries `is_errored`
+ `error_detail` — the errored read-contract (#25): flagged, never hidden, and there is
no `?errored=` filter. Mounted under `/api` by the app factory.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import Sound, Tag, User
from app.schemas.sound import SoundRead

router = APIRouter(tags=["sounds"])

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
    sound = db.scalar(
        select(Sound).where(Sound.id == sound_id, Sound.user_id == current_user.id)
    )
    if sound is None:
        raise HTTPException(status_code=404, detail="Sound not found")
    return sound
