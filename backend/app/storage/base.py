"""The storage seam (ADR-0001): a thin `save/get/delete`-by-key interface.

Audio bytes live behind this interface, never in the database (data-model.md). The
local-disk implementation backs it in dev; an S3-compatible one swaps in later with
**no call-site changes**. Call sites depend only on this abstract `Storage` and on
`StorageObjectNotFound` — never on filesystem or S3 specifics — which is what makes
that swap invisible.
"""

from abc import ABC, abstractmethod


class StorageObjectNotFound(Exception):
    """Raised by `get` when no object exists for the given key.

    A backend-neutral error (not `FileNotFoundError` / an S3 client error) so call
    sites handle "missing" identically regardless of the implementation.
    """

    def __init__(self, key: str) -> None:
        super().__init__(f"No stored object for key: {key!r}")
        self.key = key


class Storage(ABC):
    """Blob storage addressed by opaque string keys.

    A key is an implementation-independent identifier (e.g. `"sounds/<uuid>.mp3"`).
    Implementations must treat it as opaque and must not let it escape their storage
    root (see `LocalDiskStorage`). Only `bytes` are supported at launch; streaming
    reads can be added as a separate method when large-file download needs it.
    """

    @abstractmethod
    def save(self, key: str, data: bytes) -> None:
        """Store `data` under `key`, overwriting any existing object."""

    @abstractmethod
    def get(self, key: str) -> bytes:
        """Return the bytes stored under `key`.

        Raises `StorageObjectNotFound` if the key has no object.
        """

    @abstractmethod
    def delete(self, key: str) -> None:
        """Remove the object stored under `key`.

        Idempotent: deleting a missing key is a no-op, not an error (matches S3 and
        keeps sound-deletion side effects race-free).
        """
