"""Integration test: the walking-skeleton sounds endpoint.

`GET /api/sounds` is the first real domain route (#6). It proves the wiring
FastAPI -> SQLAlchemy -> Postgres end to end by resolving the implicit current
user (a genuine DB roundtrip) and returning the user's — currently empty — library.
"""

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import User


def test_list_sounds_empty_library_returns_empty_array(client: TestClient) -> None:
    resp = client.get("/api/sounds")
    assert resp.status_code == 200
    assert resp.json() == []


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
    assert set(props) == {"id", "name"}
