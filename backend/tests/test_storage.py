"""Storage seam tests: the interface contract (via the fake), the local-disk backend
against a temp dir, and the DI provider wiring. No real disk beyond pytest's tmp_path.
"""

from pathlib import Path

import pytest

from app.settings import get_settings
from app.storage import LocalDiskStorage, Storage, StorageObjectNotFound, get_storage
from tests.fakes import FakeStorage


def _backends(tmp_path: Path) -> list[Storage]:
    """Both backends, exercised through the identical `Storage` contract."""
    return [FakeStorage(), LocalDiskStorage(tmp_path)]


# --- contract: same behavior for every backend ------------------------------------

def test_save_get_round_trip(tmp_path: Path) -> None:
    for storage in _backends(tmp_path):
        storage.save("sounds/a.mp3", b"\x00\x01audio")
        assert storage.get("sounds/a.mp3") == b"\x00\x01audio"


def test_save_overwrites(tmp_path: Path) -> None:
    for storage in _backends(tmp_path):
        storage.save("k", b"first")
        storage.save("k", b"second")
        assert storage.get("k") == b"second"


def test_delete_removes(tmp_path: Path) -> None:
    for storage in _backends(tmp_path):
        storage.save("k", b"data")
        storage.delete("k")
        with pytest.raises(StorageObjectNotFound):
            storage.get("k")


def test_get_missing_raises(tmp_path: Path) -> None:
    for storage in _backends(tmp_path):
        with pytest.raises(StorageObjectNotFound):
            storage.get("nope")


def test_delete_missing_is_idempotent(tmp_path: Path) -> None:
    for storage in _backends(tmp_path):
        storage.delete("never-existed")  # must not raise


# --- local-disk specifics ---------------------------------------------------------

def test_local_disk_writes_real_file(tmp_path: Path) -> None:
    storage = LocalDiskStorage(tmp_path)
    storage.save("sub/dir/file.bin", b"bytes")
    assert (tmp_path / "sub" / "dir" / "file.bin").read_bytes() == b"bytes"


@pytest.mark.parametrize("bad_key", ["../escape", "a/../../b", "/etc/passwd", "", "  "])
def test_local_disk_rejects_unsafe_keys(tmp_path: Path, bad_key: str) -> None:
    storage = LocalDiskStorage(tmp_path)
    with pytest.raises(ValueError):
        storage.save(bad_key, b"x")


# --- DI provider ------------------------------------------------------------------

def test_get_storage_returns_local_disk_at_configured_root(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("STORAGE_ROOT", str(tmp_path))
    # Both providers are lru_cached; clear so the new env is read.
    get_settings.cache_clear()
    get_storage.cache_clear()
    try:
        storage = get_storage()
        assert isinstance(storage, LocalDiskStorage)
        storage.save("k", b"v")
        assert (tmp_path / "k").read_bytes() == b"v"
    finally:
        get_settings.cache_clear()
        get_storage.cache_clear()
