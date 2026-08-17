"""Integration tests: Tags CRUD (#38).

`GET/POST/PATCH/DELETE /api/tags` — scoped to the current user throughout. Duplicate
names (`UNIQUE(user_id, name)`) -> 409; missing/wrong-tenant ids -> 404; delete drops
the sound_tags join rows.
"""

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Sound, SoundKind, Tag, User


def _make_user(db: Session) -> User:
    user = User()
    db.add(user)
    db.flush()
    return user


def _make_tag(db: Session, user: User, name: str) -> Tag:
    tag = Tag(user_id=user.id, name=name)
    db.add(tag)
    db.flush()
    return tag


def _make_file_sound(db: Session, user: User, name: str) -> Sound:
    sound = Sound(
        user_id=user.id,
        name=name,
        kind=SoundKind.FILE,
        storage_key=f"sounds/{name}.mp3",
        content_type="audio/mpeg",
    )
    db.add(sound)
    db.flush()
    return sound


def _seed_current_user(client: TestClient) -> None:
    """Resolve (and thus create) the implicit current user via a request.

    Call before creating an "other" user in a test, so that second user is genuinely
    a distinct tenant rather than accidentally becoming the resolved current user
    (get_current_user picks the earliest-created row).
    """
    client.get("/api/tags")


# --- list ---------------------------------------------------------------


def test_list_tags_empty_returns_empty_array(client: TestClient) -> None:
    resp = client.get("/api/tags")
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_tags_sorted_az_and_scoped_to_current_user(
    client: TestClient, db: Session
) -> None:
    user = _make_user(db)
    _make_tag(db, user, "zephyr")
    _make_tag(db, user, "ambience")
    other = _make_user(db)
    _make_tag(db, other, "not mine")
    db.commit()

    resp = client.get("/api/tags")
    assert resp.status_code == 200
    assert [t["name"] for t in resp.json()] == ["ambience", "zephyr"]


# --- create ---------------------------------------------------------------


def test_create_tag_returns_201_with_id_and_name(client: TestClient, db: Session) -> None:
    resp = client.post("/api/tags", json={"name": "tavern"})
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "tavern"
    assert "id" in body
    assert "created_at" in body

    assert db.scalar(select(func.count()).select_from(Tag)) == 1


def test_create_tag_duplicate_for_same_user_returns_409(client: TestClient) -> None:
    resp = client.post("/api/tags", json={"name": "tavern"})
    assert resp.status_code == 201

    resp = client.post("/api/tags", json={"name": "tavern"})
    assert resp.status_code == 409


def test_create_tag_same_name_different_user_is_allowed(
    client: TestClient, db: Session
) -> None:
    _seed_current_user(client)
    other = _make_user(db)
    _make_tag(db, other, "tavern")
    db.commit()

    resp = client.post("/api/tags", json={"name": "tavern"})
    assert resp.status_code == 201


# --- rename (PATCH) ---------------------------------------------------------------


def test_rename_tag_updates_name(client: TestClient, db: Session) -> None:
    user = _make_user(db)
    tag = _make_tag(db, user, "old-name")
    db.commit()

    resp = client.patch(f"/api/tags/{tag.id}", json={"name": "new-name"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "new-name"

    db.refresh(tag)
    assert tag.name == "new-name"


def test_rename_tag_to_own_existing_name_returns_409(client: TestClient, db: Session) -> None:
    user = _make_user(db)
    _make_tag(db, user, "ambience")
    target = _make_tag(db, user, "music")
    db.commit()

    resp = client.patch(f"/api/tags/{target.id}", json={"name": "ambience"})
    assert resp.status_code == 409


def test_rename_tag_to_its_own_current_name_is_a_no_op_success(
    client: TestClient, db: Session
) -> None:
    user = _make_user(db)
    tag = _make_tag(db, user, "ambience")
    db.commit()

    resp = client.patch(f"/api/tags/{tag.id}", json={"name": "ambience"})
    assert resp.status_code == 200


def test_rename_tag_missing_returns_404(client: TestClient) -> None:
    resp = client.patch(
        "/api/tags/00000000-0000-0000-0000-000000000000", json={"name": "x"}
    )
    assert resp.status_code == 404


def test_rename_tag_wrong_tenant_returns_404(client: TestClient, db: Session) -> None:
    _seed_current_user(client)
    other = _make_user(db)
    tag = _make_tag(db, other, "not mine")
    db.commit()

    resp = client.patch(f"/api/tags/{tag.id}", json={"name": "renamed"})
    assert resp.status_code == 404


# --- delete ---------------------------------------------------------------


def test_delete_tag_removes_it(client: TestClient, db: Session) -> None:
    user = _make_user(db)
    tag = _make_tag(db, user, "ambience")
    db.commit()

    resp = client.delete(f"/api/tags/{tag.id}")
    assert resp.status_code == 204

    assert db.scalar(select(func.count()).select_from(Tag)) == 0


def test_delete_tag_drops_sound_tags_join_rows(client: TestClient, db: Session) -> None:
    user = _make_user(db)
    tag = _make_tag(db, user, "ambience")
    sound = _make_file_sound(db, user, "Tavern Loop")
    sound.tags.append(tag)
    db.commit()

    resp = client.delete(f"/api/tags/{tag.id}")
    assert resp.status_code == 204

    db.refresh(sound)
    assert sound.tags == []


def test_delete_tag_missing_returns_404(client: TestClient) -> None:
    resp = client.delete("/api/tags/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


def test_delete_tag_wrong_tenant_returns_404(client: TestClient, db: Session) -> None:
    _seed_current_user(client)
    other = _make_user(db)
    tag = _make_tag(db, other, "not mine")
    db.commit()

    resp = client.delete(f"/api/tags/{tag.id}")
    assert resp.status_code == 404
    assert db.scalar(select(func.count()).select_from(Tag)) == 1
