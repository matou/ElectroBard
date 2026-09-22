"""Integration coverage for current-User Layer CRUD and ordering."""

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Update, func, select
from sqlalchemy.orm import Session

from app.models import Layer, Set, Tag, User


def _current_user(db: Session) -> User:
    user = db.scalar(select(User).order_by(User.created_at).limit(1))
    assert user is not None
    return user


def _layers(db: Session, user: User) -> list[Layer]:
    return list(
        db.scalars(
            select(Layer).where(Layer.user_id == user.id).order_by(Layer.position)
        ).all()
    )


def _seed_current_user(client: TestClient, db: Session) -> User:
    response = client.get("/api/layers")
    assert response.status_code == 200
    assert [item["name"] for item in response.json()] == [
        "Music",
        "Ambience",
        "Sound Effects",
    ]
    return _current_user(db)


def test_list_layers_is_position_ordered_and_can_be_empty(
    client: TestClient, db: Session
) -> None:
    user = _seed_current_user(client, db)
    for layer in _layers(db, user):
        db.delete(layer)
    db.commit()

    assert client.get("/api/layers").json() == []

    db.add_all(
        [
            Layer(user_id=user.id, name="Second", position=1),
            Layer(user_id=user.id, name="First", position=0),
        ]
    )
    db.commit()

    assert [item["name"] for item in client.get("/api/layers").json()] == [
        "First",
        "Second",
    ]


def test_list_layers_is_tenant_scoped(client: TestClient, db: Session) -> None:
    _seed_current_user(client, db)
    other = User()
    db.add(other)
    db.flush()
    db.add(Layer(user_id=other.id, name="Foreign", position=0))
    db.commit()

    assert "Foreign" not in [item["name"] for item in client.get("/api/layers").json()]


def test_create_layer_appends_with_defaults_and_full_representation(
    client: TestClient,
) -> None:
    response = client.post("/api/layers", json={"name": "Voices"})

    assert response.status_code == 201
    body = response.json()
    assert body.keys() == {
        "id",
        "name",
        "position",
        "playback_mode",
        "volume",
        "created_at",
    }
    UUID(body.pop("id"))
    datetime.fromisoformat(body.pop("created_at"))
    assert body == {
        "name": "Voices",
        "position": 3,
        "playback_mode": "single",
        "volume": 80,
    }


def test_create_layer_accepts_settings_and_duplicate_names(client: TestClient) -> None:
    payload = {"name": "Ambience", "playback_mode": "self_stacking", "volume": 0}
    first = client.post("/api/layers", json=payload)
    second = client.post("/api/layers", json=payload)

    assert first.status_code == second.status_code == 201
    assert first.json()["position"] == 3
    assert second.json()["position"] == 4
    assert second.json()["playback_mode"] == "self_stacking"
    assert second.json()["volume"] == 0


def test_append_and_delete_lock_the_current_user(
    client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _seed_current_user(client, db)
    original_scalar = db.scalar
    locked_statements = 0

    def record_locks(statement: Any, *args: Any, **kwargs: Any) -> Any:
        nonlocal locked_statements
        if getattr(statement, "_for_update_arg", None) is not None:
            locked_statements += 1
        return original_scalar(statement, *args, **kwargs)

    monkeypatch.setattr(db, "scalar", record_locks)
    created = client.post("/api/layers", json={"name": "Serialized"})
    assert created.status_code == 201
    assert client.delete(f"/api/layers/{created.json()['id']}").status_code == 204
    assert locked_statements == 2


@pytest.mark.parametrize(
    ("raw_name", "canonical_name"),
    [
        ("\u2003  Outer trim \u3000", "Outer trim"),
        ("inner   spaces", "inner   spaces"),
        ("é", "é"),
        ("x" * 100, "x" * 100),
    ],
)
def test_layer_name_is_canonicalized(
    client: TestClient, raw_name: str, canonical_name: str
) -> None:
    response = client.post("/api/layers", json={"name": raw_name})
    assert response.status_code == 201
    assert response.json()["name"] == canonical_name


@pytest.mark.parametrize(
    "name",
    ["", " \t\n ", "x" * 101, "line\nbreak", "null\x00byte", "delete\x7f"],
)
def test_create_rejects_every_invalid_name_boundary(client: TestClient, name: str) -> None:
    response = client.post("/api/layers", json={"name": name})
    assert response.status_code == 422


@pytest.mark.parametrize("volume", [-1, 101, True, 1.5])
def test_create_rejects_non_integer_or_out_of_range_volume(
    client: TestClient, volume: object
) -> None:
    assert client.post("/api/layers", json={"name": "Bad", "volume": volume}).status_code == 422


def test_create_rejects_invalid_mode_and_read_only_position(client: TestClient) -> None:
    assert (
        client.post(
            "/api/layers", json={"name": "Bad", "playback_mode": "simultaneous"}
        ).status_code
        == 422
    )
    assert client.post("/api/layers", json={"name": "Bad", "position": 99}).status_code == 422


def test_patch_partially_edits_settings_and_canonicalizes_name(client: TestClient) -> None:
    created = client.post("/api/layers", json={"name": "Original"}).json()

    renamed = client.patch(
        f"/api/layers/{created['id']}", json={"name": "  Renamed  ", "volume": 100}
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Renamed"
    assert renamed.json()["volume"] == 100
    assert renamed.json()["playback_mode"] == "single"

    mode_only = client.patch(
        f"/api/layers/{created['id']}", json={"playback_mode": "multiset"}
    )
    assert mode_only.status_code == 200
    assert mode_only.json()["name"] == "Renamed"
    assert mode_only.json()["playback_mode"] == "multiset"


def test_failed_patch_preserves_stored_layer(client: TestClient) -> None:
    created = client.post("/api/layers", json={"name": "Original", "volume": 42}).json()

    response = client.patch(
        f"/api/layers/{created['id']}", json={"name": "invalid\nname", "volume": 55}
    )
    assert response.status_code == 422

    listed = {item["id"]: item for item in client.get("/api/layers").json()}
    assert listed[created["id"]]["name"] == "Original"
    assert listed[created["id"]]["volume"] == 42


@pytest.mark.parametrize(
    "payload", [{"name": None}, {"volume": None}, {"playback_mode": None}, {"position": 0}]
)
def test_patch_rejects_nulls_and_read_only_position(
    client: TestClient, payload: dict[str, object]
) -> None:
    created = client.post("/api/layers", json={"name": "Original"}).json()
    assert client.patch(f"/api/layers/{created['id']}", json=payload).status_code == 422


def test_patch_missing_and_wrong_tenant_are_indistinguishable(
    client: TestClient, db: Session
) -> None:
    _seed_current_user(client, db)
    other = User()
    db.add(other)
    db.flush()
    foreign = Layer(user_id=other.id, name="Foreign", position=0)
    db.add(foreign)
    db.commit()

    missing = client.patch(f"/api/layers/{uuid4()}", json={"name": "Nope"})
    wrong_tenant = client.patch(f"/api/layers/{foreign.id}", json={"name": "Nope"})
    assert missing.status_code == wrong_tenant.status_code == 404
    assert missing.json() == wrong_tenant.json() == {"detail": "Layer not found"}


def test_delete_cascades_sets_and_set_tags_but_preserves_tags(
    client: TestClient, db: Session
) -> None:
    user = _seed_current_user(client, db)
    layer = _layers(db, user)[1]
    tag = Tag(user_id=user.id, name="rain")
    child = Set(layer_id=layer.id, name="Storm", position=0, tags=[tag])
    db.add(child)
    db.commit()

    response = client.delete(f"/api/layers/{layer.id}")

    assert response.status_code == 204
    assert db.scalar(select(func.count()).select_from(Set)) == 0
    assert db.scalar(select(func.count()).select_from(Tag)) == 1


def test_delete_compacts_middle_position_and_next_create_appends(
    client: TestClient, db: Session
) -> None:
    user = _seed_current_user(client, db)
    deleted = _layers(db, user)[1]

    assert client.delete(f"/api/layers/{deleted.id}").status_code == 204
    assert [(layer.name, layer.position) for layer in _layers(db, user)] == [
        ("Music", 0),
        ("Sound Effects", 1),
    ]

    created = client.post("/api/layers", json={"name": "New"})
    assert created.status_code == 201
    assert created.json()["position"] == 2


def test_delete_compaction_failure_rolls_back_every_change(
    client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    user = _seed_current_user(client, db)
    deleted = _layers(db, user)[1]
    before = [(layer.id, layer.position) for layer in _layers(db, user)]
    original_execute = db.execute
    update_count = 0

    def fail_during_compaction(statement: Any, *args: Any, **kwargs: Any) -> Any:
        nonlocal update_count
        if isinstance(statement, Update):
            update_count += 1
            if update_count == 2:
                raise RuntimeError("forced compaction failure")
        return original_execute(statement, *args, **kwargs)

    monkeypatch.setattr(db, "execute", fail_during_compaction)
    with pytest.raises(RuntimeError, match="forced compaction failure"):
        client.delete(f"/api/layers/{deleted.id}")

    assert [(layer.id, layer.position) for layer in _layers(db, user)] == before


def test_delete_missing_and_wrong_tenant_do_not_change_layers(
    client: TestClient, db: Session
) -> None:
    user = _seed_current_user(client, db)
    other = User()
    db.add(other)
    db.flush()
    foreign = Layer(user_id=other.id, name="Foreign", position=0)
    db.add(foreign)
    db.commit()

    before = [(layer.id, layer.position) for layer in _layers(db, user)]
    assert client.delete(f"/api/layers/{uuid4()}").status_code == 404
    assert client.delete(f"/api/layers/{foreign.id}").status_code == 404
    assert [(layer.id, layer.position) for layer in _layers(db, user)] == before


def test_openapi_layer_writes_do_not_accept_position(client: TestClient) -> None:
    document = client.get("/openapi.json").json()
    schemas = document["components"]["schemas"]

    assert "position" not in schemas["LayerCreate"]["properties"]
    assert "position" not in schemas["LayerUpdate"]["properties"]
    assert schemas["LayerRead"]["properties"]["position"]["type"] == "integer"
    assert document["paths"]["/api/layers"]["get"]["operationId"] == "list_layers"
    assert document["paths"]["/api/layers"]["post"]["operationId"] == "create_layer"
