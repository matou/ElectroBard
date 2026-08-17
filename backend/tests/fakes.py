"""Test doubles for injected boundaries (storage, and later oEmbed)."""

from app.storage.base import Storage, StorageObjectNotFound


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
