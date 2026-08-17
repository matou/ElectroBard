"""Tags router — CRUD over the current user's tags (api-contract: Tags).

Tags drive set composition (M2) and Sound filtering (`GET /api/sounds?tag=`, #35).
Tag assignment on a Sound is done through `PATCH /api/sounds/{id}` (api-contract:
Tags), so this router only manages the tags themselves. Mounted under `/api` by the
app factory.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import Tag, User
from app.schemas.tag import TagRead, TagWrite

router = APIRouter(tags=["tags"])


def _get_own_tag(db: Session, current_user: User, tag_id: UUID) -> Tag:
    """Fetch one of the current user's tags, or 404 (missing or wrong tenant)."""
    tag = db.scalar(select(Tag).where(Tag.id == tag_id, Tag.user_id == current_user.id))
    if tag is None:
        raise HTTPException(status_code=404, detail="Tag not found")
    return tag


def _check_name_available(
    db: Session, current_user: User, name: str, exclude_id: UUID | None = None
) -> None:
    """409 if the user already has a different tag with this name (`UNIQUE(user_id,
    name)`). Checked up front rather than caught as an IntegrityError, so a collision
    never leaves the request's transaction needing a rollback.
    """
    stmt = select(Tag.id).where(Tag.user_id == current_user.id, Tag.name == name)
    if exclude_id is not None:
        stmt = stmt.where(Tag.id != exclude_id)
    if db.scalar(stmt) is not None:
        raise HTTPException(status_code=409, detail="A tag with this name already exists")


@router.get("/tags", response_model=list[TagRead])
def list_tags(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Tag]:
    """List the current user's tags, A-Z by name."""
    stmt = select(Tag).where(Tag.user_id == current_user.id).order_by(Tag.name)
    return list(db.scalars(stmt).all())


@router.post("/tags", response_model=TagRead, status_code=status.HTTP_201_CREATED)
def create_tag(
    body: TagWrite,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Tag:
    """Create a tag. 409 if the user already has one with this name."""
    _check_name_available(db, current_user, body.name)

    tag = Tag(user_id=current_user.id, name=body.name)
    db.add(tag)
    db.flush()  # populate id/created_at for the response
    return tag


@router.patch("/tags/{tag_id}", response_model=TagRead)
def rename_tag(
    tag_id: UUID,
    body: TagWrite,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Tag:
    """Rename a tag. 404 if missing/wrong tenant; 409 on a name collision."""
    tag = _get_own_tag(db, current_user, tag_id)
    _check_name_available(db, current_user, body.name, exclude_id=tag_id)

    tag.name = body.name
    db.flush()
    return tag


@router.delete("/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tag(
    tag_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Delete a tag. Drops it from every Sound (`sound_tags` cascades at the DB level
    via `ON DELETE CASCADE`); a Sound (or, later, a Set) may end up with no tags and
    just stays that way — post-M1 concern. 404 if missing/wrong tenant.
    """
    tag = _get_own_tag(db, current_user, tag_id)
    db.delete(tag)
