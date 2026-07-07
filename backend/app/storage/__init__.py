"""Storage seam: interface, local-disk backend, and DI provider (ADR-0001)."""

from app.storage.base import Storage, StorageObjectNotFound
from app.storage.deps import get_storage
from app.storage.local import LocalDiskStorage

__all__ = ["Storage", "StorageObjectNotFound", "LocalDiskStorage", "get_storage"]
