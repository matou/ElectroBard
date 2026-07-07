"""Local-disk `Storage` implementation — the dev backend for the storage seam.

Objects are files under a configurable root directory. Keys may contain `/` to nest
(e.g. `"sounds/<uuid>.mp3"`); parent directories are created on save. Keys are
validated so a crafted key can never read or write outside the root.
"""

from pathlib import Path, PurePosixPath

from app.storage.base import Storage, StorageObjectNotFound


class LocalDiskStorage(Storage):
    def __init__(self, root: str | Path) -> None:
        # Resolve once so every key is checked against an absolute, symlink-free root.
        self._root = Path(root).resolve()

    def _path_for(self, key: str) -> Path:
        """Map a key to an absolute path, rejecting anything that escapes the root."""
        if not key or key != key.strip():
            raise ValueError(f"Invalid storage key: {key!r}")

        parts = PurePosixPath(key).parts
        # Reject absolute keys ("/x") and parent-traversal ("../x", "a/../../b").
        if PurePosixPath(key).is_absolute() or ".." in parts:
            raise ValueError(f"Unsafe storage key: {key!r}")

        path = (self._root / key).resolve()
        # Defense in depth: the resolved path must still sit under the root.
        if path != self._root and self._root not in path.parents:
            raise ValueError(f"Storage key escapes root: {key!r}")
        return path

    def save(self, key: str, data: bytes) -> None:
        path = self._path_for(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def get(self, key: str) -> bytes:
        path = self._path_for(key)
        try:
            return path.read_bytes()
        except (FileNotFoundError, IsADirectoryError) as exc:
            raise StorageObjectNotFound(key) from exc

    def delete(self, key: str) -> None:
        path = self._path_for(key)
        path.unlink(missing_ok=True)  # idempotent per the Storage contract
