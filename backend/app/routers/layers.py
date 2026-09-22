"""Current-User Layer CRUD and dense append/delete ordering."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import Layer, User
from app.schemas.layer import LayerCreate, LayerRead, LayerUpdate

router = APIRouter(tags=["layers"])


def _lock_current_user(db: Session, current_user: User) -> User:
    """Serialize operations that allocate or compact the User's Layer positions."""
    locked_user = db.scalar(select(User).where(User.id == current_user.id).with_for_update())
    if locked_user is None:  # Defensive: the dependency resolved this row moments ago.
        raise HTTPException(status_code=404, detail="Layer not found")
    return locked_user


def _get_own_layer(db: Session, current_user: User, layer_id: UUID) -> Layer:
    layer = db.scalar(
        select(Layer).where(Layer.id == layer_id, Layer.user_id == current_user.id)
    )
    if layer is None:
        raise HTTPException(status_code=404, detail="Layer not found")
    return layer


@router.get("/layers", response_model=list[LayerRead])
def list_layers(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Layer]:
    stmt = (
        select(Layer).where(Layer.user_id == current_user.id).order_by(Layer.position)
    )
    return list(db.scalars(stmt).all())


@router.post("/layers", response_model=LayerRead, status_code=status.HTTP_201_CREATED)
def create_layer(
    body: LayerCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Layer:
    _lock_current_user(db, current_user)
    last_position = db.scalar(
        select(func.max(Layer.position)).where(Layer.user_id == current_user.id)
    )
    layer = Layer(
        user_id=current_user.id,
        name=body.name,
        position=0 if last_position is None else last_position + 1,
        playback_mode=body.playback_mode,
        volume=body.volume,
    )
    db.add(layer)
    db.flush()
    return layer


@router.patch("/layers/{layer_id}", response_model=LayerRead)
def update_layer(
    layer_id: UUID,
    body: LayerUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Layer:
    layer = _get_own_layer(db, current_user, layer_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(layer, field, value)
    db.flush()
    return layer


@router.delete("/layers/{layer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_layer(
    layer_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    _lock_current_user(db, current_user)
    layer = _get_own_layer(db, current_user, layer_id)
    deleted_position = layer.position

    db.delete(layer)
    db.flush()  # Remove the occupied position (and cascading Sets) before compaction.

    # Move affected rows above the current range before assigning their final
    # positions. This keeps UNIQUE(user_id, position) enabled throughout even if
    # PostgreSQL visits rows in an inconvenient order.
    max_position = db.scalar(
        select(func.max(Layer.position)).where(Layer.user_id == current_user.id)
    )
    if max_position is None or max_position <= deleted_position:
        return
    offset = max_position + 1
    affected = (Layer.user_id == current_user.id) & (Layer.position > deleted_position)
    db.execute(update(Layer).where(affected).values(position=Layer.position + offset))
    db.execute(
        update(Layer)
        .where(
            (Layer.user_id == current_user.id)
            & (Layer.position > deleted_position + offset)
        )
        .values(position=Layer.position - offset - 1)
    )
