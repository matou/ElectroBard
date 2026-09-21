"""Persistence coverage for Layer, Set, and set_tags."""

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.models import Layer, Set, Tag
from app.services import create_user_with_starter_layers


def test_set_persists_defaults_and_tag_association(db: Session) -> None:
    user = create_user_with_starter_layers(db)
    layer = user.layers[0]
    tag = Tag(user_id=user.id, name="battle")
    configured_set = Set(layer=layer, name="Combat", position=0, tags=[tag])
    db.add(configured_set)
    db.flush()

    fetched = db.scalar(select(Set).where(Set.id == configured_set.id))
    assert fetched is not None
    assert fetched.loop is False
    assert fetched.shuffle is False
    assert fetched.tags == [tag]


def test_deleting_layer_cascades_to_sets_and_set_tags(db: Session) -> None:
    user = create_user_with_starter_layers(db)
    tag = Tag(user_id=user.id, name="weather")
    configured_set = Set(layer=user.layers[1], name="Rain", position=0, tags=[tag])
    db.add(configured_set)
    db.flush()
    set_id = configured_set.id

    db.delete(user.layers[1])
    db.flush()

    assert db.get(Set, set_id) is None
    assert db.scalar(text("SELECT count(*) FROM set_tags WHERE set_id = :id"), {"id": set_id}) == 0


def test_layer_names_may_be_duplicated(db: Session) -> None:
    user = create_user_with_starter_layers(db)
    db.add(Layer(user_id=user.id, name="Music", position=3))
    db.flush()

    assert (
        db.scalar(
            select(func.count())
            .select_from(Layer)
            .where(Layer.user_id == user.id, Layer.name == "Music")
        )
        == 2
    )
