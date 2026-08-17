"""Integration tests: Sound mutation + deletion (`PATCH`/`DELETE /api/sounds/{id}`, #39).

`PATCH` renames and sets the full tag list in one call (Q4 — single
membership-recompute write path); unknown/wrong-tenant tag ids -> 422. `DELETE` drops
the Sound and, for `file` sounds, its blob via the storage seam (idempotent,
ADR-0001); `youtube` sounds have no blob to remove. Both 404 on missing/wrong-tenant.
"""

from typing import cast

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Sound, SoundKind, Tag, User
from app.storage import get_storage
from tests.fakes import FailingDeleteStorage, FakeStorage


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


def _make_file_sound(db: Session, user: User, name: str, storage_key: str | None = None) -> Sound:
    sound = Sound(
        user_id=user.id,
        name=name,
        kind=SoundKind.FILE,
        storage_key=storage_key or f"sounds/{name}.mp3",
        content_type="audio/mpeg",
    )
    db.add(sound)
    db.flush()
    return sound


def _make_youtube_sound(db: Session, user: User, name: str) -> Sound:
    sound = Sound(user_id=user.id, name=name, kind=SoundKind.YOUTUBE, youtube_video_id="abc123")
    db.add(sound)
    db.flush()
    return sound


def _seed_current_user(client: TestClient) -> None:
    """Resolve (and thus create) the implicit current user via a request. Call before
    creating an "other" user in a test, so that second user is genuinely a distinct
    tenant rather than accidentally becoming the resolved current user
    (get_current_user picks the earliest-created row).
    """
    client.get("/api/sounds")


# --- PATCH: rename -------------------------------------------------------


def test_patch_renames_sound(client: TestClient, db: Session) -> None:
    user = _make_user(db)
    sound = _make_file_sound(db, user, "Old Name")
    db.commit()

    resp = client.patch(f"/api/sounds/{sound.id}", json={"name": "New Name", "tag_ids": []})
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "New Name"
    assert body["id"] == str(sound.id)

    db.refresh(sound)
    assert sound.name == "New Name"


# --- PATCH: tag assignment ------------------------------------------------


def test_patch_replaces_tag_set_add_and_remove_in_one_call(client: TestClient, db: Session) -> None:
    user = _make_user(db)
    sound = _make_file_sound(db, user, "Tavern Loop")
    keep = _make_tag(db, user, "ambience")
    drop = _make_tag(db, user, "combat")
    add = _make_tag(db, user, "night")
    sound.tags = [keep, drop]
    db.commit()

    resp = client.patch(
        f"/api/sounds/{sound.id}",
        json={"name": sound.name, "tag_ids": [str(keep.id), str(add.id)]},
    )
    assert resp.status_code == 200

    db.refresh(sound)
    assert {tag.id for tag in sound.tags} == {keep.id, add.id}


def test_patch_empty_tag_list_clears_all_tags(client: TestClient, db: Session) -> None:
    user = _make_user(db)
    sound = _make_file_sound(db, user, "Tavern Loop")
    sound.tags = [_make_tag(db, user, "ambience")]
    db.commit()

    resp = client.patch(f"/api/sounds/{sound.id}", json={"name": sound.name, "tag_ids": []})
    assert resp.status_code == 200

    db.refresh(sound)
    assert sound.tags == []


def test_patch_unknown_tag_id_returns_422_and_does_not_write(client: TestClient, db: Session) -> None:
    user = _make_user(db)
    sound = _make_file_sound(db, user, "Tavern Loop")
    kept = _make_tag(db, user, "ambience")
    sound.tags = [kept]
    db.commit()

    resp = client.patch(
        f"/api/sounds/{sound.id}",
        json={"name": "Renamed", "tag_ids": ["00000000-0000-0000-0000-000000000000"]},
    )
    assert resp.status_code == 422

    db.refresh(sound)
    assert sound.name == "Tavern Loop"
    assert [tag.id for tag in sound.tags] == [kept.id]


def test_patch_wrong_tenant_tag_id_returns_422(client: TestClient, db: Session) -> None:
    user = _make_user(db)
    sound = _make_file_sound(db, user, "Tavern Loop")
    other = _make_user(db)
    others_tag = _make_tag(db, other, "not-mine")
    db.commit()

    resp = client.patch(
        f"/api/sounds/{sound.id}",
        json={"name": sound.name, "tag_ids": [str(others_tag.id)]},
    )
    assert resp.status_code == 422


# --- PATCH: 404s -----------------------------------------------------------


def test_patch_missing_sound_returns_404(client: TestClient) -> None:
    resp = client.patch(
        "/api/sounds/00000000-0000-0000-0000-000000000000",
        json={"name": "x", "tag_ids": []},
    )
    assert resp.status_code == 404


def test_patch_wrong_tenant_sound_returns_404(client: TestClient, db: Session) -> None:
    _seed_current_user(client)
    other = _make_user(db)
    sound = _make_file_sound(db, other, "Not Mine")
    db.commit()

    resp = client.patch(f"/api/sounds/{sound.id}", json={"name": "Mine Now", "tag_ids": []})
    assert resp.status_code == 404


# --- DELETE: file sound ------------------------------------------------


def test_delete_file_sound_removes_row_and_calls_storage_delete(
    client: TestClient, db: Session, storage: FakeStorage
) -> None:
    user = _make_user(db)
    sound = _make_file_sound(db, user, "Tavern Loop", storage_key="sounds/tavern.mp3")
    storage.save(sound.storage_key, b"fake audio bytes")
    db.commit()

    resp = client.delete(f"/api/sounds/{sound.id}")
    assert resp.status_code == 204

    assert db.scalar(select(Sound).where(Sound.id == sound.id)) is None
    assert "sounds/tavern.mp3" not in storage._objects


def test_delete_file_sound_storage_failure_leaves_row_intact(client: TestClient, db: Session) -> None:
    user = _make_user(db)
    sound = _make_file_sound(db, user, "Tavern Loop")
    db.commit()
    sound_id = sound.id

    app = cast(FastAPI, client.app)
    app.dependency_overrides[get_storage] = lambda: FailingDeleteStorage()
    try:
        with pytest.raises(OSError):
            client.delete(f"/api/sounds/{sound_id}")
    finally:
        app.dependency_overrides[get_storage] = lambda: FakeStorage()

    assert db.scalar(select(Sound).where(Sound.id == sound_id)) is not None


# --- DELETE: youtube sound (no storage call) ----------------------------


def test_delete_youtube_sound_removes_row_without_storage_call(
    client: TestClient, db: Session, storage: FakeStorage
) -> None:
    user = _make_user(db)
    sound = _make_youtube_sound(db, user, "Boss Theme")
    db.commit()

    resp = client.delete(f"/api/sounds/{sound.id}")
    assert resp.status_code == 204
    assert db.scalar(select(Sound).where(Sound.id == sound.id)) is None


# --- DELETE: tag membership cleanup, 404s -------------------------------


def test_delete_sound_drops_its_tag_memberships(client: TestClient, db: Session) -> None:
    user = _make_user(db)
    sound = _make_file_sound(db, user, "Tavern Loop")
    tag = _make_tag(db, user, "ambience")
    sound.tags = [tag]
    db.commit()

    resp = client.delete(f"/api/sounds/{sound.id}")
    assert resp.status_code == 204

    # the tag itself survives; only the join row is gone
    assert db.scalar(select(Tag).where(Tag.id == tag.id)) is not None
    assert db.scalar(select(func.count()).select_from(Sound)) == 0


def test_delete_missing_sound_returns_404(client: TestClient) -> None:
    resp = client.delete("/api/sounds/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


def test_delete_wrong_tenant_sound_returns_404(client: TestClient, db: Session) -> None:
    _seed_current_user(client)
    other = _make_user(db)
    sound = _make_file_sound(db, other, "Not Mine")
    db.commit()

    resp = client.delete(f"/api/sounds/{sound.id}")
    assert resp.status_code == 404
    assert db.scalar(select(Sound).where(Sound.id == sound.id)) is not None


# --- OpenAPI ----------------------------------------------------------


def test_openapi_operation_ids_are_route_names(client: TestClient) -> None:
    """Operation IDs drive the generated client's function names (matches the
    convention already asserted for the read endpoints in test_sounds.py)."""
    schema = client.get("/openapi.json").json()

    path = schema["paths"]["/api/sounds/{sound_id}"]
    assert path["patch"]["operationId"] == "update_sound"
    assert path["delete"]["operationId"] == "delete_sound"
    assert path["delete"]["responses"]["204"]
