"""Integration coverage for current-User Set CRUD and Tag assignment."""

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Update, func, select
from sqlalchemy.orm import Session

from app.models import Layer, Set, Tag, User


def _create_sets(
    client: TestClient, layer_id: str, *names: str
) -> list[dict[str, Any]]:
    created = []
    for name in names:
        response = client.post(
            f"/api/layers/{layer_id}/sets",
            json={"name": name, "tagIds": []},
        )
        assert response.status_code == 201
        created.append(response.json())
    return created


def test_create_set_appends_with_defaults_and_full_representation(
    client: TestClient,
) -> None:
    layer = client.get("/api/layers").json()[0]

    response = client.post(
        f"/api/layers/{layer['id']}/sets",
        json={"name": "Combat", "tagIds": []},
    )

    assert response.status_code == 201
    body = response.json()
    assert body.keys() == {
        "id",
        "layer_id",
        "name",
        "position",
        "loop",
        "shuffle",
        "tags",
        "created_at",
    }
    UUID(body.pop("id"))
    datetime.fromisoformat(body.pop("created_at"))
    assert body == {
        "layer_id": layer["id"],
        "name": "Combat",
        "position": 0,
        "loop": False,
        "shuffle": False,
        "tags": [],
    }


def test_list_and_detail_return_position_ordered_sets_with_selected_tags(
    client: TestClient,
) -> None:
    layer = client.get("/api/layers").json()[0]
    rain = client.post("/api/tags", json={"name": "rain"}).json()
    storm = client.post("/api/tags", json={"name": "storm"}).json()
    first = client.post(
        f"/api/layers/{layer['id']}/sets",
        json={
            "name": "Weather",
            "tagIds": [storm["id"], rain["id"]],
            "loop": True,
            "shuffle": True,
        },
    ).json()
    second = client.post(
        f"/api/layers/{layer['id']}/sets",
        json={"name": "Weather", "tagIds": []},
    ).json()

    response = client.get(f"/api/layers/{layer['id']}/sets")

    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [first["id"], second["id"]]
    assert [item["position"] for item in response.json()] == [0, 1]
    assert first["loop"] is True
    assert first["shuffle"] is True
    assert [tag["name"] for tag in first["tags"]] == ["rain", "storm"]
    assert client.get(f"/api/sets/{first['id']}").json() == first


def test_patch_edits_settings_and_distinguishes_omitted_from_empty_tag_ids(
    client: TestClient,
) -> None:
    layer = client.get("/api/layers").json()[0]
    tag = client.post("/api/tags", json={"name": "combat"}).json()
    configured_set = client.post(
        f"/api/layers/{layer['id']}/sets",
        json={"name": "Original", "tagIds": [tag["id"]]},
    ).json()

    preserved = client.patch(
        f"/api/sets/{configured_set['id']}",
        json={"name": " Renamed ", "loop": True, "shuffle": True},
    )

    assert preserved.status_code == 200
    assert preserved.json()["name"] == "Renamed"
    assert preserved.json()["loop"] is True
    assert preserved.json()["shuffle"] is True
    assert [item["id"] for item in preserved.json()["tags"]] == [tag["id"]]

    cleared = client.patch(
        f"/api/sets/{configured_set['id']}", json={"tagIds": []}
    )
    assert cleared.status_code == 200
    assert cleared.json()["tags"] == []


def test_delete_set_compacts_positions_without_deleting_tags(
    client: TestClient, db: Session
) -> None:
    layer = client.get("/api/layers").json()[0]
    tag = client.post("/api/tags", json={"name": "shared"}).json()
    created = [
        client.post(
            f"/api/layers/{layer['id']}/sets",
            json={"name": name, "tagIds": [tag["id"]]},
        ).json()
        for name in ("First", "Middle", "Last")
    ]

    response = client.delete(f"/api/sets/{created[1]['id']}")

    assert response.status_code == 204
    remaining = client.get(f"/api/layers/{layer['id']}/sets").json()
    assert [item["name"] for item in remaining] == ["First", "Last"]
    assert [item["position"] for item in remaining] == [0, 1]
    assert db.scalar(select(func.count()).select_from(Set)) == 2
    assert db.scalar(select(func.count()).select_from(Tag)) == 1


def test_invalid_and_foreign_tag_ids_are_indistinguishable_and_atomic(
    client: TestClient, db: Session
) -> None:
    layer = client.get("/api/layers").json()[0]
    own_tag = client.post("/api/tags", json={"name": "own"}).json()
    configured_set = client.post(
        f"/api/layers/{layer['id']}/sets",
        json={"name": "Unchanged", "tagIds": [own_tag["id"]]},
    ).json()
    other = User()
    db.add(other)
    db.flush()
    foreign_tag = Tag(user_id=other.id, name="foreign")
    db.add(foreign_tag)
    db.commit()

    missing = client.patch(
        f"/api/sets/{configured_set['id']}",
        json={"name": "Rejected", "tagIds": [str(uuid4())]},
    )
    foreign = client.patch(
        f"/api/sets/{configured_set['id']}",
        json={"name": "Rejected", "tagIds": [str(foreign_tag.id)]},
    )

    assert missing.status_code == foreign.status_code == 422
    assert missing.json() == foreign.json()
    assert client.get(f"/api/sets/{configured_set['id']}").json() == configured_set

    rejected_create = client.post(
        f"/api/layers/{layer['id']}/sets",
        json={"name": "Rejected", "tagIds": [str(foreign_tag.id)]},
    )
    assert rejected_create.status_code == 422
    assert [item["name"] for item in client.get(f"/api/layers/{layer['id']}/sets").json()] == [
        "Unchanged"
    ]


def test_layer_and_set_routes_hide_missing_and_foreign_resources(
    client: TestClient, db: Session
) -> None:
    client.get("/api/layers")
    other = User()
    db.add(other)
    db.flush()
    foreign_layer = Layer(user_id=other.id, name="Foreign", position=0)
    foreign_set = Set(layer=foreign_layer, name="Foreign", position=0)
    db.add(foreign_set)
    db.commit()
    missing_id = uuid4()

    for layer_id in (missing_id, foreign_layer.id):
        assert client.get(f"/api/layers/{layer_id}/sets").status_code == 404
        assert (
            client.post(
                f"/api/layers/{layer_id}/sets",
                json={"name": "Hidden", "tagIds": []},
            ).status_code
            == 404
        )
    for set_id in (missing_id, foreign_set.id):
        assert client.get(f"/api/sets/{set_id}").status_code == 404
        assert client.patch(f"/api/sets/{set_id}", json={"name": "Hidden"}).status_code == 404
        assert client.delete(f"/api/sets/{set_id}").status_code == 404


@pytest.mark.parametrize(
    ("raw_name", "canonical_name"),
    [
        ("\u2003  Outer trim \u3000", "Outer trim"),
        ("inner   spaces", "inner   spaces"),
        ("é", "é"),
        ("x" * 100, "x" * 100),
    ],
)
def test_set_name_is_canonicalized(
    client: TestClient, raw_name: str, canonical_name: str
) -> None:
    layer = client.get("/api/layers").json()[0]
    response = client.post(
        f"/api/layers/{layer['id']}/sets",
        json={"name": raw_name, "tagIds": []},
    )
    assert response.status_code == 201
    assert response.json()["name"] == canonical_name


@pytest.mark.parametrize(
    "name", ["", " \t\n ", "x" * 101, "line\nbreak", "null\x00byte", "delete\x7f"]
)
def test_invalid_set_name_rejects_create_and_preserves_patch(
    client: TestClient, name: str
) -> None:
    layer = client.get("/api/layers").json()[0]
    assert (
        client.post(
            f"/api/layers/{layer['id']}/sets", json={"name": name, "tagIds": []}
        ).status_code
        == 422
    )
    configured_set = client.post(
        f"/api/layers/{layer['id']}/sets",
        json={"name": "Valid", "tagIds": []},
    ).json()
    assert client.patch(f"/api/sets/{configured_set['id']}", json={"name": name}).status_code == 422
    assert client.get(f"/api/sets/{configured_set['id']}").json() == configured_set


def test_deleting_tag_preserves_a_valid_tagless_set(client: TestClient) -> None:
    layer = client.get("/api/layers").json()[0]
    tag = client.post("/api/tags", json={"name": "temporary"}).json()
    configured_set = client.post(
        f"/api/layers/{layer['id']}/sets",
        json={"name": "Persistent", "tagIds": [tag["id"]]},
    ).json()

    assert client.delete(f"/api/tags/{tag['id']}").status_code == 204

    response = client.get(f"/api/sets/{configured_set['id']}")
    assert response.status_code == 200
    assert response.json()["tags"] == []


def test_set_write_contract_rejects_read_only_fields_and_uses_tag_ids_alias(
    client: TestClient,
) -> None:
    layer = client.get("/api/layers").json()[0]
    create_path = f"/api/layers/{layer['id']}/sets"
    for field in ("position", "layer_id"):
        payload = {"name": "Invalid", "tagIds": [], field: 4}
        assert client.post(create_path, json=payload).status_code == 422

    configured_set = client.post(
        create_path, json={"name": "Valid", "tagIds": []}
    ).json()
    for field in ("position", "layer_id"):
        assert (
            client.patch(f"/api/sets/{configured_set['id']}", json={field: 4}).status_code
            == 422
        )

    openapi = client.get("/openapi.json").json()
    schemas = openapi["components"]["schemas"]
    assert set(schemas["SetCreate"]["properties"]) == {"name", "tagIds", "loop", "shuffle"}
    assert set(schemas["SetUpdate"]["properties"]) == {"name", "tagIds", "loop", "shuffle"}
    assert set(schemas["SetReorder"]["properties"]) == {"ordered_ids"}
    assert (
        openapi["paths"]["/api/layers/{layer_id}/sets/reorder"]["patch"]["operationId"]
        == "reorder_sets"
    )


def test_reorder_sets_reverses_complete_layer_collection(client: TestClient) -> None:
    layer = client.get("/api/layers").json()[0]
    created = _create_sets(client, layer["id"], "First", "Second", "Third")

    response = client.patch(
        f"/api/layers/{layer['id']}/sets/reorder",
        json={"ordered_ids": [item["id"] for item in reversed(created)]},
    )

    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [
        item["id"] for item in reversed(created)
    ]
    assert [item["position"] for item in response.json()] == [0, 1, 2]
    assert client.get(f"/api/layers/{layer['id']}/sets").json() == response.json()


def test_reorder_sets_rejects_duplicate_ids(client: TestClient) -> None:
    layer = client.get("/api/layers").json()[0]
    created = _create_sets(client, layer["id"], "First", "Second")

    response = client.patch(
        f"/api/layers/{layer['id']}/sets/reorder",
        json={"ordered_ids": [created[0]["id"], created[0]["id"]]},
    )

    assert response.status_code == 422
    assert client.get(f"/api/layers/{layer['id']}/sets").json() == created


def test_reorder_sets_accepts_unchanged_and_empty_collections(client: TestClient) -> None:
    layers = client.get("/api/layers").json()
    layer = layers[0]
    created = _create_sets(client, layer["id"], "First", "Second")

    unchanged = client.patch(
        f"/api/layers/{layer['id']}/sets/reorder",
        json={"ordered_ids": [item["id"] for item in created]},
    )
    empty = client.patch(
        f"/api/layers/{layers[1]['id']}/sets/reorder", json={"ordered_ids": []}
    )

    assert unchanged.status_code == 200
    assert unchanged.json() == created
    assert empty.status_code == 200
    assert empty.json() == []


@pytest.mark.parametrize(
    "payload",
    [
        {"ordered_ids": ["not-a-uuid"]},
        {"ordered_ids": [], "unexpected": True},
        {},
    ],
)
def test_reorder_sets_requires_exact_well_formed_body(
    client: TestClient, payload: dict[str, object]
) -> None:
    layer = client.get("/api/layers").json()[0]
    response = client.patch(
        f"/api/layers/{layer['id']}/sets/reorder", json=payload
    )
    assert response.status_code == 422


def test_reorder_set_membership_mismatches_share_one_generic_error(
    client: TestClient, db: Session
) -> None:
    layers = client.get("/api/layers").json()
    target_layer = layers[0]
    other_layer = layers[1]
    own_sets = _create_sets(
        client, target_layer["id"], "First", "Second", "Third"
    )
    wrong_layer_set = client.post(
        f"/api/layers/{other_layer['id']}/sets",
        json={"name": "Wrong layer", "tagIds": []},
    ).json()
    other_user = User()
    db.add(other_user)
    db.flush()
    foreign_layer = Layer(user_id=other_user.id, name="Foreign", position=0)
    foreign_set = Set(layer=foreign_layer, name="Foreign", position=0)
    db.add(foreign_set)
    db.commit()
    own_ids = [item["id"] for item in own_sets]

    submitted_lists = [
        own_ids[:-1],
        [*own_ids, str(uuid4())],
        [*own_ids[:-1], str(uuid4())],
        [*own_ids[:-1], str(foreign_set.id)],
        [*own_ids[:-1], wrong_layer_set["id"]],
    ]
    responses = [
        client.patch(
            f"/api/layers/{target_layer['id']}/sets/reorder",
            json={"ordered_ids": ids},
        )
        for ids in submitted_lists
    ]

    assert {response.status_code for response in responses} == {409}
    assert {response.json()["detail"] for response in responses} == {
        "Set collection does not match"
    }
    assert client.get(f"/api/layers/{target_layer['id']}/sets").json() == own_sets
    assert client.get(f"/api/sets/{wrong_layer_set['id']}").json() == wrong_layer_set


def test_reorder_sets_hides_missing_and_foreign_parent_layers(
    client: TestClient, db: Session
) -> None:
    client.get("/api/layers")
    other_user = User()
    db.add(other_user)
    db.flush()
    foreign_layer = Layer(user_id=other_user.id, name="Foreign", position=0)
    db.add(foreign_layer)
    db.commit()

    responses = [
        client.patch(
            f"/api/layers/{layer_id}/sets/reorder", json={"ordered_ids": []}
        )
        for layer_id in (uuid4(), foreign_layer.id)
    ]

    assert {response.status_code for response in responses} == {404}
    assert {response.json()["detail"] for response in responses} == {"Layer not found"}


def test_reorder_set_failure_rolls_back_the_entire_previous_order(
    client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    layer = client.get("/api/layers").json()[0]
    created = _create_sets(client, layer["id"], "First", "Second", "Third")
    original_execute = db.execute
    update_count = 0

    def fail_during_reorder(statement: Any, *args: Any, **kwargs: Any) -> Any:
        nonlocal update_count
        if isinstance(statement, Update):
            update_count += 1
            if update_count == 2:
                raise RuntimeError("forced reorder failure")
        return original_execute(statement, *args, **kwargs)

    monkeypatch.setattr(db, "execute", fail_during_reorder)
    with pytest.raises(RuntimeError, match="forced reorder failure"):
        client.patch(
            f"/api/layers/{layer['id']}/sets/reorder",
            json={"ordered_ids": [item["id"] for item in reversed(created)]},
        )

    assert client.get(f"/api/layers/{layer['id']}/sets").json() == created


def test_set_reorders_use_last_successful_write_for_unchanged_membership(
    client: TestClient,
) -> None:
    layer = client.get("/api/layers").json()[0]
    created = _create_sets(client, layer["id"], "First", "Second", "Third")
    first_ids = [item["id"] for item in reversed(created)]
    final_ids = [created[1]["id"], created[2]["id"], created[0]["id"]]

    assert client.patch(
        f"/api/layers/{layer['id']}/sets/reorder",
        json={"ordered_ids": first_ids},
    ).status_code == 200
    final = client.patch(
        f"/api/layers/{layer['id']}/sets/reorder",
        json={"ordered_ids": final_ids},
    )

    assert final.status_code == 200
    assert [item["id"] for item in final.json()] == final_ids
    assert client.get(f"/api/layers/{layer['id']}/sets").json() == final.json()


def test_delete_compaction_failure_rolls_back_every_change(
    client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    layer = client.get("/api/layers").json()[0]
    created = [
        client.post(
            f"/api/layers/{layer['id']}/sets",
            json={"name": name, "tagIds": []},
        ).json()
        for name in ("First", "Middle", "Last")
    ]
    before = [(item["id"], item["position"]) for item in created]
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
        client.delete(f"/api/sets/{created[1]['id']}")

    restored = client.get(f"/api/layers/{layer['id']}/sets").json()
    assert [(item["id"], item["position"]) for item in restored] == before


def test_order_changing_routes_lock_the_parent_layer(
    client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    layer = client.get("/api/layers").json()[0]
    original_scalar = db.scalar
    locked_statements = 0

    def record_locks(statement: Any, *args: Any, **kwargs: Any) -> Any:
        nonlocal locked_statements
        if getattr(statement, "_for_update_arg", None) is not None:
            locked_statements += 1
        return original_scalar(statement, *args, **kwargs)

    monkeypatch.setattr(db, "scalar", record_locks)
    created = client.post(
        f"/api/layers/{layer['id']}/sets",
        json={"name": "Serialized", "tagIds": []},
    )
    assert created.status_code == 201
    assert client.patch(
        f"/api/layers/{layer['id']}/sets/reorder",
        json={"ordered_ids": [created.json()["id"]]},
    ).status_code == 200
    assert client.delete(f"/api/sets/{created.json()['id']}").status_code == 204
    assert locked_statements == 3
