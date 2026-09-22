"""Exactly-once and atomic starter-Layer provisioning."""

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.deps import get_current_user
from app.models import Layer, PlaybackMode, Set, User
from app.services import (
    StarterLayerInvariantError,
    create_user_with_starter_layers,
    provision_starter_layers,
)


def _layers(db: Session, user: User) -> list[Layer]:
    return list(
        db.scalars(select(Layer).where(Layer.user_id == user.id).order_by(Layer.position)).all()
    )


def test_create_user_provisions_canonical_layers_and_no_sets(db: Session) -> None:
    user = create_user_with_starter_layers(db)

    assert user.starter_layers_provisioned_at is not None
    assert [
        (layer.name, layer.position, layer.playback_mode, layer.volume)
        for layer in _layers(db, user)
    ] == [
        ("Music", 0, PlaybackMode.SINGLE, 80),
        ("Ambience", 1, PlaybackMode.MULTISET, 80),
        ("Sound Effects", 2, PlaybackMode.SELF_STACKING, 80),
    ]
    assert db.scalar(select(func.count()).select_from(Set)) == 0


def test_retry_is_noop_after_starter_rename_and_delete(db: Session) -> None:
    user = create_user_with_starter_layers(db)
    original_marker = user.starter_layers_provisioned_at
    layers = _layers(db, user)
    layers[0].name = "Songs"
    db.delete(layers[2])
    db.flush()

    provision_starter_layers(db, user)

    remaining = _layers(db, user)
    assert [(layer.name, layer.position) for layer in remaining] == [("Songs", 0), ("Ambience", 1)]
    assert user.starter_layers_provisioned_at == original_marker


def test_null_marker_with_existing_layer_is_invariant_error(db: Session) -> None:
    user = User()
    db.add(user)
    db.flush()
    db.add(Layer(user_id=user.id, name="Existing", position=0))
    db.flush()

    with pytest.raises(StarterLayerInvariantError):
        provision_starter_layers(db, user)

    assert [(layer.name, layer.position) for layer in _layers(db, user)] == [("Existing", 0)]
    assert user.starter_layers_provisioned_at is None


def test_user_and_provisioning_roll_back_together(db: Session) -> None:
    with pytest.raises(RuntimeError, match="later failure"):
        with db.begin_nested():
            create_user_with_starter_layers(db)
            raise RuntimeError("later failure")

    assert db.scalar(select(func.count()).select_from(User)) == 0
    assert db.scalar(select(func.count()).select_from(Layer)) == 0


def test_fresh_implicit_user_is_fully_provisioned(db: Session) -> None:
    user = get_current_user(db)

    assert user.starter_layers_provisioned_at is not None
    assert len(_layers(db, user)) == 3
