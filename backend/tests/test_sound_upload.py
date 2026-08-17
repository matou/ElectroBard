"""Integration tests: file upload ingestion (`POST /api/sounds/upload`, #36).

Multipart upload -> one `file` Sound. Extension-only format validation (no magic-byte
sniffing, #22), a mutagen duration probe that never fails the upload (ADR-0006), and a
single-transaction persist so a storage failure leaves no orphan row.
"""

import wave
from io import BytesIO
from typing import cast

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Sound
from app.storage import get_storage
from tests.fakes import FailingStorage, FakeStorage


def _wav_bytes(seconds: float = 2.0, framerate: int = 8000) -> bytes:
    """A tiny, real, silent WAV file — mutagen can read a true duration from it,
    unlike the arbitrary garbage bytes used in the format-mapping tests below.
    """
    buf = BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(framerate)
        w.writeframes(b"\x00\x00" * int(framerate * seconds))
    return buf.getvalue()


def test_upload_wav_sets_content_type_storage_key_and_probed_duration(
    client: TestClient, db: Session
) -> None:
    resp = client.post(
        "/api/sounds/upload",
        files={"file": ("rain_loop.wav", _wav_bytes(2.0), "audio/whatever")},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "rain_loop"
    assert body["kind"] == "file"
    assert body["content_type"] == "audio/wav"
    assert body["duration_seconds"] == 2
    assert body["is_errored"] is False

    sound = db.scalar(select(Sound).where(Sound.id == body["id"]))
    assert sound is not None
    assert sound.storage_key == f"sounds/{sound.id}.wav"


@pytest.mark.parametrize(
    ("ext", "content_type"),
    [
        ("mp3", "audio/mpeg"),
        ("ogg", "audio/ogg"),
        ("wav", "audio/wav"),
        ("m4a", "audio/mp4"),
        ("flac", "audio/flac"),
    ],
)
def test_upload_maps_extension_to_canonical_content_type(
    client: TestClient, db: Session, ext: str, content_type: str
) -> None:
    resp = client.post(
        "/api/sounds/upload",
        files={"file": (f"track.{ext}", b"not really audio bytes", "application/octet-stream")},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["content_type"] == content_type
    # mutagen can't parse the fake bytes: duration stays null, upload still succeeds
    # (ADR-0006) — a duration miss is never an upload failure.
    assert body["duration_seconds"] is None

    sound = db.scalar(select(Sound).where(Sound.id == body["id"]))
    assert sound is not None
    assert sound.storage_key == f"sounds/{sound.id}.{ext}"


def test_upload_extension_match_is_case_insensitive(client: TestClient) -> None:
    resp = client.post("/api/sounds/upload", files={"file": ("Track.MP3", b"fake", "audio/mpeg")})
    assert resp.status_code == 201
    assert resp.json()["content_type"] == "audio/mpeg"


def test_upload_ignores_client_declared_content_type(client: TestClient) -> None:
    """The multipart part's declared Content-Type is never trusted — only the
    filename's extension decides the stored `content_type` (#22).
    """
    resp = client.post("/api/sounds/upload", files={"file": ("track.wav", b"fake", "image/png")})
    assert resp.status_code == 201
    assert resp.json()["content_type"] == "audio/wav"


def test_upload_name_seeds_from_filename_minus_extension(client: TestClient) -> None:
    resp = client.post("/api/sounds/upload", files={"file": ("Boss Theme.flac", b"x", "audio/x")})
    assert resp.status_code == 201
    assert resp.json()["name"] == "Boss Theme"


def test_upload_empty_stem_names_sound_untitled(client: TestClient) -> None:
    resp = client.post("/api/sounds/upload", files={"file": (".mp3", b"fake", "audio/mpeg")})
    assert resp.status_code == 201
    assert resp.json()["name"] == "Untitled"


def test_upload_missing_extension_returns_422(client: TestClient) -> None:
    resp = client.post("/api/sounds/upload", files={"file": ("noext", b"data", "audio/mpeg")})
    assert resp.status_code == 422
    assert "mp3" in resp.json()["detail"]


def test_upload_unknown_extension_returns_422(client: TestClient) -> None:
    resp = client.post("/api/sounds/upload", files={"file": ("track.exe", b"data", "audio/mpeg")})
    assert resp.status_code == 422


def test_upload_leaves_no_orphan_row_or_sounds_endpoint_change(
    client: TestClient, db: Session
) -> None:
    resp = client.post("/api/sounds/upload", files={"file": ("noext", b"data", "audio/mpeg")})
    assert resp.status_code == 422
    assert db.scalar(select(func.count()).select_from(Sound)) == 0


def test_upload_save_failure_leaves_no_orphan_row(client: TestClient, db: Session) -> None:
    app = cast(FastAPI, client.app)
    app.dependency_overrides[get_storage] = lambda: FailingStorage()
    try:
        with pytest.raises(OSError):
            client.post("/api/sounds/upload", files={"file": ("track.mp3", b"data", "audio/mpeg")})
    finally:
        app.dependency_overrides[get_storage] = lambda: FakeStorage()

    assert db.scalar(select(func.count()).select_from(Sound)) == 0


def test_upload_openapi_documents_upload_as_201_sound_read(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()
    op = schema["paths"]["/api/sounds/upload"]["post"]
    assert op["operationId"] == "upload_sound"
    created = op["responses"]["201"]["content"]["application/json"]["schema"]
    assert created["$ref"] == "#/components/schemas/SoundRead"
