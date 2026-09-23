"""Current-User Set CRUD and full-list Tag assignment."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import Layer, Set, Tag, User
from app.schemas.set import SetCreate, SetRead, SetReorder, SetUpdate

router = APIRouter(tags=["sets"])


def _get_own_layer(db: Session, current_user: User, layer_id: UUID) -> Layer:
    layer = db.scalar(
        select(Layer).where(Layer.id == layer_id, Layer.user_id == current_user.id)
    )
    if layer is None:
        raise HTTPException(status_code=404, detail="Layer not found")
    return layer


def _lock_own_layer(db: Session, current_user: User, layer_id: UUID) -> Layer:
    layer = db.scalar(
        select(Layer)
        .where(Layer.id == layer_id, Layer.user_id == current_user.id)
        .with_for_update()
    )
    if layer is None:
        raise HTTPException(status_code=404, detail="Layer not found")
    return layer


def _get_own_set(db: Session, current_user: User, set_id: UUID) -> Set:
    configured_set = db.scalar(
        select(Set)
        .join(Set.layer)
        .where(Set.id == set_id, Layer.user_id == current_user.id)
    )
    if configured_set is None:
        raise HTTPException(status_code=404, detail="Set not found")
    return configured_set


def _own_tags(db: Session, current_user: User, tag_ids: list[UUID]) -> list[Tag]:
    tags = list(
        db.scalars(select(Tag).where(Tag.id.in_(tag_ids), Tag.user_id == current_user.id))
    )
    if {tag.id for tag in tags} != set(tag_ids):
        raise HTTPException(status_code=422, detail="Unknown tag id(s)")
    return tags


@router.get("/layers/{layer_id}/sets", response_model=list[SetRead])
def list_sets(
    layer_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Set]:
    """List one owned Layer's Sets in display order."""
    layer = _get_own_layer(db, current_user, layer_id)
    return list(
        db.scalars(
            select(Set).where(Set.layer_id == layer.id).order_by(Set.position)
        ).all()
    )


@router.get("/sets/{set_id}", response_model=SetRead)
def get_set(
    set_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Set:
    """Fetch one Set through its current-User Layer."""
    return _get_own_set(db, current_user, set_id)


@router.post(
    "/layers/{layer_id}/sets",
    response_model=SetRead,
    status_code=status.HTTP_201_CREATED,
)
def create_set(
    layer_id: UUID,
    body: SetCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Set:
    """Append a Set and atomically assign the complete selected Tag list."""
    layer = _lock_own_layer(db, current_user, layer_id)
    tags = _own_tags(db, current_user, body.tag_ids)
    last_position = db.scalar(
        select(func.max(Set.position)).where(Set.layer_id == layer.id)
    )
    configured_set = Set(
        layer=layer,
        name=body.name,
        position=0 if last_position is None else last_position + 1,
        loop=body.loop,
        shuffle=body.shuffle,
        tags=tags,
    )
    db.add(configured_set)
    db.flush()
    return configured_set


@router.patch("/layers/{layer_id}/sets/reorder", response_model=list[SetRead])
def reorder_sets(
    layer_id: UUID,
    body: SetReorder,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Set]:
    layer = _lock_own_layer(db, current_user, layer_id)
    configured_sets = list(
        db.scalars(
            select(Set).where(Set.layer_id == layer.id).order_by(Set.position)
        ).all()
    )
    sets_by_id = {configured_set.id: configured_set for configured_set in configured_sets}
    if set(body.ordered_ids) != set(sets_by_id):
        raise HTTPException(status_code=409, detail="Set collection does not match")
    ordered_sets = [sets_by_id[set_id] for set_id in body.ordered_ids]
    if ordered_sets == configured_sets:
        return configured_sets

    if configured_sets:
        # Vacate the entire persisted range before assigning final positions, so
        # every final value is free while the unique constraint remains enabled.
        offset = configured_sets[-1].position + 1
        db.execute(
            update(Set)
            .where(Set.layer_id == layer.id)
            .values(position=Set.position + offset)
        )
        for position, configured_set in enumerate(ordered_sets):
            db.execute(
                update(Set).where(Set.id == configured_set.id).values(position=position)
            )
        db.flush()
        for configured_set in ordered_sets:
            db.refresh(configured_set)
    return ordered_sets


@router.patch("/sets/{set_id}", response_model=SetRead)
def update_set(
    set_id: UUID,
    body: SetUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Set:
    """Edit Set settings; replace Tags only when tagIds is present."""
    configured_set = _get_own_set(db, current_user, set_id)
    changes = body.model_dump(exclude_unset=True)
    if "tag_ids" in changes:
        configured_set.tags = _own_tags(db, current_user, changes.pop("tag_ids"))
    for field, value in changes.items():
        setattr(configured_set, field, value)
    db.flush()
    return configured_set


@router.delete("/sets/{set_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_set(
    set_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Delete one Set and compact its Layer's remaining positions."""
    # Locate the parent before taking its lock, then refetch the Set after the lock
    # is held in case another parent-serialized delete won the race while we waited.
    set_before_lock = _get_own_set(db, current_user, set_id)
    layer = _lock_own_layer(db, current_user, set_before_lock.layer_id)
    configured_set = _get_own_set(db, current_user, set_id)
    deleted_position = configured_set.position

    db.delete(configured_set)
    db.flush()

    max_position = db.scalar(
        select(func.max(Set.position)).where(Set.layer_id == layer.id)
    )
    if max_position is None or max_position <= deleted_position:
        return

    # Vacate every affected final position before compacting. This preserves the
    # UNIQUE(layer_id, position) constraint regardless of PostgreSQL's update order.
    offset = max_position + 1
    affected = (Set.layer_id == layer.id) & (Set.position > deleted_position)
    db.execute(update(Set).where(affected).values(position=Set.position + offset))
    db.execute(
        update(Set)
        .where(
            (Set.layer_id == layer.id)
            & (Set.position > deleted_position + offset)
        )
        .values(position=Set.position - offset - 1)
    )
