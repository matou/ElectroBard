"""Integration tests: audio preview endpoint (`GET /api/sounds/{id}/audio`, #40).

Serves `file` sound bytes for in-browser preview via the storage seam. YouTube sounds
play client-side (IFrame API), so this endpoint 404s for them. Built on a range-capable
file response (api-contract "Range note") — no Range/206 request is exercised in M1
(play/stop only, prototype #21), but `Accept-Ranges` must be advertised so a future
scrubber is a non-breaking add.
"""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Sound, SoundKind, User
from tests.fakes import FakeStorage


def _make_user(db: Session) -> User:
    user = User()
    db.add(user)
    db.flush()
    return user


def test_get_audio_returns_file_sound_bytes_with_content_type(
    client: TestClient, db: Session, storage: FakeStorage
) -> None:
    user = _make_user(db)
    sound = Sound(
        user_id=user.id,
        name="Rain Loop",
        kind=SoundKind.FILE,
        storage_key="sounds/rain.wav",
        content_type="audio/wav",
    )
    db.add(sound)
    db.flush()
    storage.save("sounds/rain.wav", b"fake wav bytes")
    db.commit()

    resp = client.get(f"/api/sounds/{sound.id}/audio")

    assert resp.status_code == 200
    assert resp.content == b"fake wav bytes"
    assert resp.headers["content-type"] == "audio/wav"


def test_get_audio_advertises_accept_ranges(
    client: TestClient, db: Session, storage: FakeStorage
) -> None:
    user = _make_user(db)
    sound = Sound(
        user_id=user.id,
        name="Rain Loop",
        kind=SoundKind.FILE,
        storage_key="sounds/rain.wav",
        content_type="audio/wav",
    )
    db.add(sound)
    db.flush()
    storage.save("sounds/rain.wav", b"fake wav bytes")
    db.commit()

    resp = client.get(f"/api/sounds/{sound.id}/audio")

    assert resp.headers["accept-ranges"] == "bytes"


def test_get_audio_youtube_sound_returns_404(client: TestClient, db: Session) -> None:
    user = _make_user(db)
    sound = Sound(
        user_id=user.id, name="Tavern Ambience", kind=SoundKind.YOUTUBE, youtube_video_id="abc123"
    )
    db.add(sound)
    db.flush()
    db.commit()

    resp = client.get(f"/api/sounds/{sound.id}/audio")

    assert resp.status_code == 404


def test_get_audio_missing_storage_object_returns_404(client: TestClient, db: Session) -> None:
    user = _make_user(db)
    sound = Sound(
        user_id=user.id,
        name="Rain Loop",
        kind=SoundKind.FILE,
        storage_key="sounds/gone.wav",
        content_type="audio/wav",
    )
    db.add(sound)
    db.flush()
    db.commit()  # never saved to storage: blob is missing

    resp = client.get(f"/api/sounds/{sound.id}/audio")

    assert resp.status_code == 404


def test_get_audio_missing_sound_returns_404(client: TestClient) -> None:
    resp = client.get("/api/sounds/00000000-0000-0000-0000-000000000000/audio")
    assert resp.status_code == 404


def test_get_audio_openapi_documents_route(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()
    op = schema["paths"]["/api/sounds/{sound_id}/audio"]["get"]
    assert op["operationId"] == "get_sound_audio"


def test_get_audio_wrong_tenant_returns_404(
    client: TestClient, db: Session, storage: FakeStorage
) -> None:
    client.get("/api/sounds")  # seed the implicit current user
    other = _make_user(db)
    sound = Sound(
        user_id=other.id,
        name="Not Mine",
        kind=SoundKind.FILE,
        storage_key="sounds/notmine.wav",
        content_type="audio/wav",
    )
    db.add(sound)
    db.flush()
    storage.save("sounds/notmine.wav", b"fake wav bytes")
    db.commit()

    resp = client.get(f"/api/sounds/{sound.id}/audio")

    assert resp.status_code == 404
