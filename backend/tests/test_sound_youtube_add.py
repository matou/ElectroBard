"""Integration tests: keyless YouTube ingestion (`POST /api/sounds/youtube`, #37).

Structural video-ID extraction (no API key) + a mocked oEmbed client driving the
add-time embeddability heuristic (ADR-0005): 200 accepts, 401 accepts-with-warning,
400/404 reject, malformed URLs never reach oEmbed at all.
"""

from typing import cast

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Sound
from app.youtube import get_oembed_client
from app.youtube.base import OEmbedResult
from tests.fakes import FakeOEmbedClient

VIDEO_ID = "dQw4w9WgXcQ"
WATCH_URL = f"https://www.youtube.com/watch?v={VIDEO_ID}"


def _override_oembed(client: TestClient, result: OEmbedResult) -> FakeOEmbedClient:
    """Install a scripted oEmbed client for this test and return it (for `.calls`)."""
    fake = FakeOEmbedClient(result)
    app = cast(FastAPI, client.app)
    app.dependency_overrides[get_oembed_client] = lambda: fake
    return fake


def test_valid_url_with_200_oembed_creates_sound_with_title_and_null_duration(
    client: TestClient, db: Session
) -> None:
    _override_oembed(client, OEmbedResult(status_code=200, title="Never Gonna Give You Up"))

    resp = client.post("/api/sounds/youtube", json={"url": WATCH_URL})

    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Never Gonna Give You Up"
    assert body["kind"] == "youtube"
    assert body["youtube_video_id"] == VIDEO_ID
    assert body["duration_seconds"] is None
    assert body["is_errored"] is False
    assert body["content_type"] is None
    assert body["embed_warning"] is None

    sound = db.scalar(select(Sound).where(Sound.id == body["id"]))
    assert sound is not None
    assert sound.youtube_video_id == VIDEO_ID
    assert sound.storage_key is None


def test_oembed_401_accepts_with_warning(client: TestClient, db: Session) -> None:
    _override_oembed(client, OEmbedResult(status_code=401, title=None))

    resp = client.post("/api/sounds/youtube", json={"url": WATCH_URL})

    assert resp.status_code == 201
    body = resp.json()
    assert body["youtube_video_id"] == VIDEO_ID
    assert body["embed_warning"]  # non-empty warning string
    assert db.scalar(select(func.count()).select_from(Sound)) == 1


def test_oembed_401_with_no_title_falls_back_to_untitled(client: TestClient) -> None:
    _override_oembed(client, OEmbedResult(status_code=401, title=None))

    resp = client.post("/api/sounds/youtube", json={"url": WATCH_URL})

    assert resp.status_code == 201
    assert resp.json()["name"] == "Untitled"


def test_oembed_400_rejects(client: TestClient, db: Session) -> None:
    _override_oembed(client, OEmbedResult(status_code=400, title=None))

    resp = client.post("/api/sounds/youtube", json={"url": WATCH_URL})

    assert resp.status_code == 422
    assert db.scalar(select(func.count()).select_from(Sound)) == 0


def test_oembed_404_rejects(client: TestClient, db: Session) -> None:
    _override_oembed(client, OEmbedResult(status_code=404, title=None))

    resp = client.post("/api/sounds/youtube", json={"url": WATCH_URL})

    assert resp.status_code == 422
    assert db.scalar(select(func.count()).select_from(Sound)) == 0


def test_network_failure_accepts_with_warning_rather_than_rejecting(
    client: TestClient, db: Session
) -> None:
    """A transient infra blip (status_code=0, the fake's network-failure sentinel)
    must never read as "video unusable" — it warns, same as 401.
    """
    _override_oembed(client, OEmbedResult(status_code=0, title=None))

    resp = client.post("/api/sounds/youtube", json={"url": WATCH_URL})

    assert resp.status_code == 201
    assert resp.json()["embed_warning"]


def test_401_and_network_failure_warnings_have_different_wording(client: TestClient) -> None:
    """401 is a signal *from YouTube*; a network/timeout failure is an infra blip on
    our side that says nothing about the video. The two must not share copy that
    implies YouTube reported something it never did.
    """
    _override_oembed(client, OEmbedResult(status_code=401, title=None))
    disabled_warning = client.post("/api/sounds/youtube", json={"url": WATCH_URL}).json()[
        "embed_warning"
    ]

    _override_oembed(client, OEmbedResult(status_code=0, title=None))
    unverified_warning = client.post("/api/sounds/youtube", json={"url": WATCH_URL}).json()[
        "embed_warning"
    ]

    assert disabled_warning != unverified_warning


def test_malformed_url_returns_422_without_calling_oembed(client: TestClient, db: Session) -> None:
    fake = _override_oembed(client, OEmbedResult(status_code=200, title="unused"))

    resp = client.post(
        "/api/sounds/youtube", json={"url": "https://www.youtube.com/playlist?list=x"}
    )

    assert resp.status_code == 422
    assert fake.calls == []
    assert db.scalar(select(func.count()).select_from(Sound)) == 0


def test_openapi_documents_youtube_add_as_201_youtube_sound_read(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()
    op = schema["paths"]["/api/sounds/youtube"]["post"]
    assert op["operationId"] == "add_youtube_sound"
    created = op["responses"]["201"]["content"]["application/json"]["schema"]
    assert created["$ref"] == "#/components/schemas/YoutubeSoundRead"
