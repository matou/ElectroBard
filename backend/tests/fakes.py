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
