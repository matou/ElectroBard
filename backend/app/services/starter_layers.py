"""Exactly-once starter-Layer provisioning for every new User."""

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.models import Layer, PlaybackMode, User


class StarterLayerInvariantError(RuntimeError):
    """A User has Layers despite never completing starter provisioning."""


@dataclass(frozen=True)
class StarterLayerSpec:
    name: str
    playback_mode: PlaybackMode


STARTER_LAYERS = (
    StarterLayerSpec("Music", PlaybackMode.SINGLE),
    StarterLayerSpec("Ambience", PlaybackMode.MULTISET),
    StarterLayerSpec("Sound Effects", PlaybackMode.SELF_STACKING),
)


def provision_starter_layers(db: Session, user: User) -> User:
    """Provision starters once, within the caller's current transaction.

    Locking serializes provisioning with later Layer-order operations. This service
    flushes so failures surface here, but never commits: the caller owns the unit of
    work containing User creation, all Layers, and the marker.
    """
    locked_user = db.scalar(
        select(User)
        .where(User.id == user.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if locked_user is None:
        raise ValueError("Cannot provision starter Layers for a User that is not persisted")

    if locked_user.starter_layers_provisioned_at is not None:
        return locked_user

    has_layers = db.scalar(select(exists().where(Layer.user_id == locked_user.id)))
    if has_layers:
        raise StarterLayerInvariantError(
            "Cannot provision starter Layers: unmarked User already has Layers"
        )

    locked_user.layers.extend(
        Layer(
            name=spec.name,
            position=position,
            playback_mode=spec.playback_mode,
            volume=80,
        )
        for position, spec in enumerate(STARTER_LAYERS)
    )
    locked_user.starter_layers_provisioned_at = datetime.now(UTC)
    db.flush()
    return locked_user


def create_user_with_starter_layers(db: Session) -> User:
    """Create a User and their starter Layers as one caller-owned transaction."""
    user = User()
    db.add(user)
    db.flush()  # Provisioning locks by primary key, so the User must exist first.
    return provision_starter_layers(db, user)
