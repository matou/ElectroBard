"""Storage dependency provider.

`get_storage` is both a plain factory (usable from service code) and a FastAPI
dependency (`Depends(get_storage)`). Tests override it — via
`app.dependency_overrides` for endpoints, or by constructing a fake directly — so no
test touches real disk.
"""

from functools import lru_cache

from app.settings import get_settings
from app.storage.base import Storage
from app.storage.local import LocalDiskStorage


@lru_cache
def get_storage() -> Storage:
    """Return the process-wide storage backend (local disk at STORAGE_ROOT)."""
    return LocalDiskStorage(get_settings().storage_root)
