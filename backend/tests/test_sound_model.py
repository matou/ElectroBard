"""DB-backed integration tests for the M1 Sound/Tag models against real Postgres.

Mirrors tests/test_user_model.py: persist through the ORM, then re-fetch to observe
DB-populated defaults. Covers the single-table Sound (file + youtube kinds), the Tag,
and the sound_tags many-to-many attach (data-model.md → Sound/Tag).
"""

import uuid
from datetime import datetime

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Sound, SoundKind, Tag, User


def _make_user(db: Session) -> User:
    user = User()
    db.add(user)
    db.flush()
    return user


def test_file_sound_persists_with_defaults(db: Session) -> None:
    user = _make_user(db)
    sound = Sound(
        user_id=user.id,
        name="thunderclap.mp3",
        kind=SoundKind.FILE,
        storage_key=f"sounds/{uuid.uuid4()}.mp3",
        content_type="audio/mpeg",
        duration_seconds=12,
    )
    db.add(sound)
    db.flush()

    assert isinstance(sound.id, uuid.UUID)

    fetched = db.scalar(select(Sound).where(Sound.id == sound.id))
    assert fetched is not None
    assert fetched.kind == SoundKind.FILE
    assert fetched.storage_key is not None
    assert fetched.content_type == "audio/mpeg"
    assert fetched.duration_seconds == 12
    assert fetched.youtube_video_id is None
    # is_errored is M1-read-only: the write path is M3 (#25); an M1 sound is always false.
    assert fetched.is_errored is False
    assert fetched.error_detail is None
    assert isinstance(fetched.created_at, datetime)
    assert fetched.created_at.tzinfo is not None


def test_youtube_sound_persists_with_null_duration(db: Session) -> None:
    user = _make_user(db)
    sound = Sound(
        user_id=user.id,
        name="Tavern Ambience",
        kind=SoundKind.YOUTUBE,
        youtube_video_id="dQw4w9WgXcQ",
    )
    db.add(sound)
    db.flush()

    fetched = db.scalar(select(Sound).where(Sound.id == sound.id))
    assert fetched is not None
    assert fetched.kind == SoundKind.YOUTUBE
    assert fetched.youtube_video_id == "dQw4w9WgXcQ"
    # youtube carries no duration at add-time (keyless oEmbed, ADR-0005).
    assert fetched.duration_seconds is None
    assert fetched.storage_key is None
    assert fetched.content_type is None
    assert fetched.is_errored is False


def test_tag_name_is_unique_per_user(db: Session) -> None:
    user = _make_user(db)
    db.add(Tag(user_id=user.id, name="combat"))
    db.flush()

    fetched = db.scalar(select(Tag).where(Tag.name == "combat"))
    assert fetched is not None
    assert isinstance(fetched.id, uuid.UUID)
    assert fetched.created_at.tzinfo is not None

    # UNIQUE(user_id, name): a second "combat" for the same user is rejected...
    db.add(Tag(user_id=user.id, name="combat"))
    with pytest.raises(IntegrityError):
        db.flush()
    db.rollback()

    # ...but a different user may reuse the name.
    other = _make_user(db)
    db.add(Tag(user_id=other.id, name="combat"))
    db.flush()


def test_tag_attaches_to_sound(db: Session) -> None:
    user = _make_user(db)
    sound = Sound(
        user_id=user.id,
        name="Boss Theme",
        kind=SoundKind.YOUTUBE,
        youtube_video_id="abc123",
    )
    tag = Tag(user_id=user.id, name="battle")
    sound.tags.append(tag)
    db.add(sound)
    db.flush()
    db.expire_all()  # force a reload so the join row is read back from the DB

    fetched = db.scalar(select(Sound).where(Sound.id == sound.id))
    assert fetched is not None
    assert [t.name for t in fetched.tags] == ["battle"]
    # The relationship is navigable from the Tag side too.
    assert fetched.tags[0].sounds == [fetched]


def test_kind_is_checked_text(db: Session) -> None:
    """`kind` is checked text (data-model.md "Enums"): the DB rejects any value
    outside file/youtube. Insert raw SQL to bypass the ORM's Python-side validation
    and hit the DB CHECK constraint directly.
    """
    user = _make_user(db)
    with pytest.raises(IntegrityError):
        db.execute(
            text(
                "INSERT INTO sound (id, user_id, name, kind, is_errored, created_at) "
                "VALUES (:id, :uid, 'bad', 'podcast', false, now())"
            ),
            {"id": uuid.uuid4(), "uid": user.id},
        )
        db.flush()
