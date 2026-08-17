"""Test doubles for injected boundaries (storage, oEmbed)."""

from app.storage.base import Storage, StorageObjectNotFound
from app.youtube.base import OEmbedClient, OEmbedResult


class FakeStorage(Storage):
    """In-memory `Storage` for tests — same contract as the real backends, no disk.

    Injected in place of `LocalDiskStorage` so upload/delete flows stay deterministic
    and hit no filesystem.
    """

    def __init__(self) -> None:
        self._objects: dict[str, bytes] = {}

    def save(self, key: str, data: bytes) -> None:
        self._objects[key] = data

    def get(self, key: str) -> bytes:
        try:
            return self._objects[key]
        except KeyError:
            raise StorageObjectNotFound(key) from None

    def delete(self, key: str) -> None:
        self._objects.pop(key, None)  # idempotent, per the Storage contract


class FailingStorage(Storage):
    """A `Storage` whose `save` always raises — for testing rollback-on-failure paths
    (e.g. upload persistence must not leave an orphan row when the blob write fails).
    """

    def save(self, key: str, data: bytes) -> None:
        raise OSError("simulated storage failure")

    def get(self, key: str) -> bytes:
        raise StorageObjectNotFound(key)

    def delete(self, key: str) -> None:
        pass


class FailingDeleteStorage(Storage):
    """A `Storage` whose `delete` always raises — for testing that a sound-delete
    request rolls back its DB row when the blob delete fails (no row left pointing at
    a blob whose deletion is unresolved).
    """

    def save(self, key: str, data: bytes) -> None:
        pass

    def get(self, key: str) -> bytes:
        raise StorageObjectNotFound(key)

    def delete(self, key: str) -> None:
        raise OSError("simulated storage failure")


class FakeOEmbedClient(OEmbedClient):
    """A scripted `OEmbedClient` — returns one fixed `OEmbedResult` regardless of the
    video ID asked for. Lets tests drive each add-time branch (200/401/400/404/
    network-failure) without a real network call to YouTube. `calls` records every
    video ID asked for, so tests can assert a rejected-before-fetch URL never reaches
    the client.
    """

    def __init__(self, result: OEmbedResult) -> None:
        self._result = result
        self.calls: list[str] = []

    def fetch(self, video_id: str) -> OEmbedResult:
        self.calls.append(video_id)
        return self._result
