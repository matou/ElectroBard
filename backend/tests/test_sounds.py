"""Integration tests: the Sounds read surface (#35).

`GET /api/sounds` and `GET /api/sounds/{id}` are the real query surface over the Sound
model, scoped to the current user, A->Z by name, with `?tag=` and `?q=` filters. Every
payload carries `is_errored`/`error_detail` — the errored read-contract (#25).
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


def _make_file_sound(db: Session, user: User, name: str) -> Sound:
    sound = Sound(
        user_id=user.id,
        name=name,
        kind=SoundKind.FILE,
        storage_key=f"sounds/{name}.mp3",
        content_type="audio/mpeg",
        duration_seconds=12,
    )
    db.add(sound)
    db.flush()
    return sound


def _make_youtube_sound(db: Session, user: User, name: str) -> Sound:
    sound = Sound(
        user_id=user.id, name=name, kind=SoundKind.YOUTUBE, youtube_video_id="abc123"
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
    client.get("/api/sounds")


def test_list_sounds_empty_library_returns_empty_array(client: TestClient) -> None:
    resp = client.get("/api/sounds")
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_sounds_returns_file_and_youtube_sorted_az(
    client: TestClient, db: Session
) -> None:
    user = _make_user(db)
    _make_youtube_sound(db, user, "Zephyr Winds")
    _make_file_sound(db, user, "Anvil Strike")
    db.commit()

    resp = client.get("/api/sounds")
    assert resp.status_code == 200
    body = resp.json()
    assert [s["name"] for s in body] == ["Anvil Strike", "Zephyr Winds"]

    file_sound = next(s for s in body if s["name"] == "Anvil Strike")
    assert file_sound["kind"] == "file"
    assert file_sound["content_type"] == "audio/mpeg"
    assert file_sound["duration_seconds"] == 12
    assert file_sound["youtube_video_id"] is None
    assert file_sound["is_errored"] is False
    assert file_sound["error_detail"] is None

    yt_sound = next(s for s in body if s["name"] == "Zephyr Winds")
    assert yt_sound["kind"] == "youtube"
    assert yt_sound["youtube_video_id"] == "abc123"
    assert yt_sound["duration_seconds"] is None


def test_list_sounds_only_returns_current_users_sounds(
    client: TestClient, db: Session
) -> None:
    _seed_current_user(client)
    other = _make_user(db)
    _make_file_sound(db, other, "Not Mine")
    db.commit()

    resp = client.get("/api/sounds")
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_sounds_filters_by_tag(client: TestClient, db: Session) -> None:
    user = _make_user(db)
    tagged = _make_file_sound(db, user, "Tavern Loop")
    _make_file_sound(db, user, "Silent Track")
    tag = Tag(user_id=user.id, name="ambience")
    tagged.tags.append(tag)
    db.commit()

    resp = client.get(f"/api/sounds?tag={tag.id}")
    assert resp.status_code == 200
    assert [s["name"] for s in resp.json()] == ["Tavern Loop"]


def test_list_sounds_searches_by_name(client: TestClient, db: Session) -> None:
    user = _make_user(db)
    _make_file_sound(db, user, "Thunderclap")
    _make_file_sound(db, user, "Rainfall")
    db.commit()

    resp = client.get("/api/sounds?q=thunder")
    assert resp.status_code == 200
    assert [s["name"] for s in resp.json()] == ["Thunderclap"]


def test_get_sound_returns_full_payload(client: TestClient, db: Session) -> None:
    user = _make_user(db)
    sound = _make_file_sound(db, user, "Boss Theme")
    db.commit()

    resp = client.get(f"/api/sounds/{sound.id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == str(sound.id)
    assert body["is_errored"] is False
    assert body["error_detail"] is None


def test_get_sound_missing_returns_404(client: TestClient, db: Session) -> None:
    _seed_current_user(client)
    resp = client.get("/api/sounds/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


def test_get_sound_wrong_tenant_returns_404(client: TestClient, db: Session) -> None:
    _seed_current_user(client)
    other = _make_user(db)
    sound = _make_file_sound(db, other, "Not Mine")
    db.commit()

    resp = client.get(f"/api/sounds/{sound.id}")
    assert resp.status_code == 404


def test_requests_resolve_a_single_implicit_user(client: TestClient, db: Session) -> None:
    """The endpoint hits the DB (get-or-create the implicit user), not a literal.

    Two requests must leave exactly one User row: the first seeds it, the second
    reuses it. This is what distinguishes a genuine roundtrip from a hardcoded [].
    """
    assert db.scalar(select(func.count()).select_from(User)) == 0

    client.get("/api/sounds")
    client.get("/api/sounds")

    assert db.scalar(select(func.count()).select_from(User)) == 1


def test_openapi_documents_sounds_as_typed_array(client: TestClient) -> None:
    """The endpoint appears in OpenAPI as an array of SoundRead — this is what the
    typed client is generated from, so the contract must be typed, not `any`.
    """
    schema = client.get("/openapi.json").json()

    ok = schema["paths"]["/api/sounds"]["get"]["responses"]["200"]
    media = ok["content"]["application/json"]["schema"]
    assert media["type"] == "array"
    assert media["items"]["$ref"] == "#/components/schemas/SoundRead"

    props = schema["components"]["schemas"]["SoundRead"]["properties"]
    assert set(props) == {
        "id",
        "name",
        "kind",
        "duration_seconds",
        "is_errored",
        "error_detail",
        "youtube_video_id",
        "content_type",
        "created_at",
    }


def test_openapi_operation_ids_are_route_names(client: TestClient) -> None:
    """Operation IDs drive the generated client's function names. FastAPI's default
    (`list_sounds_api_sounds_get`) yields an ugly `listSoundsApiSoundsGet()`; using the
    route name yields a clean `listSounds()` — the `getSounds()`-style call #8 wants.
    """
    schema = client.get("/openapi.json").json()

    assert schema["paths"]["/api/sounds"]["get"]["operationId"] == "list_sounds"
    assert schema["paths"]["/api/sounds/{sound_id}"]["get"]["operationId"] == "get_sound"
