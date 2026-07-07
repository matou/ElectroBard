"""Integration test: the app boots and its health endpoints serve, including the
DB readiness probe hitting real Postgres through the injected session.
"""

from fastapi.testclient import TestClient


def test_health_liveness(client: TestClient) -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_health_db_readiness(client: TestClient) -> None:
    resp = client.get("/health/db")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
