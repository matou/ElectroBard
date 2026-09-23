"""Set membership through its public API and the canonical SoundRead payload."""

from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Layer, Set, Sound, SoundKind, Tag, User


def _set(client: TestClient, tag_ids: list[str], *, shuffle: bool = False) -> str:
    layer_id = client.get("/api/layers").json()[0]["id"]
    response = client.post(
        f"/api/layers/{layer_id}/sets",
        json={"name": "Resolved", "tagIds": tag_ids, "shuffle": shuffle},
    )
    assert response.status_code == 201
    return str(response.json()["id"])


def _sound(db: Session, user_id: UUID, name: str, tags: list[Tag], **fields: object) -> Sound:
    sound = Sound(user_id=user_id, name=name, kind=SoundKind.FILE, tags=tags, **fields)
    db.add(sound)
    db.commit()
    return sound


def test_tagless_and_unmatched_sets_return_empty_arrays(client: TestClient) -> None:
    tagless = _set(client, [])
    tag = client.post("/api/tags", json={"name": "unused"}).json()
    unmatched = _set(client, [tag["id"]])

    for set_id in (tagless, unmatched):
        response = client.get(f"/api/sets/{set_id}/sounds")
        assert response.status_code == 200
        assert response.json() == []


def test_membership_deduplicates_or_matches_and_returns_full_sound_payload(
    client: TestClient, db: Session
) -> None:
    first = client.post("/api/tags", json={"name": "first"}).json()
    second = client.post("/api/tags", json={"name": "second"}).json()
    set_id = _set(client, [first["id"], second["id"]], shuffle=True)
    user = db.query(User).order_by(User.created_at).first()
    assert user is not None
    first_tag = db.get(Tag, first["id"])
    second_tag = db.get(Tag, second["id"])
    assert first_tag is not None and second_tag is not None

    both = _sound(
        db, user.id, "Both", [first_tag, second_tag], is_errored=True, error_detail="Unavailable"
    )
    youtube = Sound(
        user_id=user.id,
        name="YouTube",
        kind=SoundKind.YOUTUBE,
        youtube_video_id="abc123",
        tags=[second_tag],
    )
    db.add(youtube)
    db.commit()
    _sound(db, user.id, "Excluded", [])

    response = client.get(f"/api/sets/{set_id}/sounds")

    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [str(both.id), str(youtube.id)]
    assert response.json() == [
        client.get(f"/api/sounds/{sound.id}").json() for sound in (both, youtube)
    ]
    assert response.json()[0]["is_errored"] is True
    assert response.json()[0]["error_detail"] == "Unavailable"


def test_membership_uses_casefold_then_uuid_without_normalization(
    client: TestClient, db: Session
) -> None:
    tag = client.post("/api/tags", json={"name": "sorted"}).json()
    set_id = _set(client, [tag["id"]])
    user = db.query(User).order_by(User.created_at).first()
    assert user is not None
    selected = db.get(Tag, tag["id"])
    assert selected is not None
    sounds = [
        _sound(db, user.id, name, [selected])
        for name in ("é", "STRASSE", "Straße", "e\u0301", "Same", "Same")
    ]
    same_names = sorted(sounds[-2:], key=lambda sound: sound.id)

    response = client.get(f"/api/sets/{set_id}/sounds")

    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [
        str(sounds[3].id),
        *[str(sound.id) for sound in same_names],
        *[str(sound.id) for sound in sorted(sounds[1:3], key=lambda sound: sound.id)],
        str(sounds[0].id),
    ]


def test_membership_recomputes_after_association_and_tag_changes(
    client: TestClient, db: Session
) -> None:
    tag = client.post("/api/tags", json={"name": "selected"}).json()
    set_id = _set(client, [tag["id"]])
    user = db.query(User).order_by(User.created_at).first()
    assert user is not None
    selected = db.get(Tag, tag["id"])
    assert selected is not None
    sound = _sound(db, user.id, "Mutable", [])

    assert client.get(f"/api/sets/{set_id}/sounds").json() == []
    updated = client.patch(
        f"/api/sounds/{sound.id}", json={"name": "Mutable", "tag_ids": [tag["id"]]}
    )
    assert updated.status_code == 200
    assert client.get(f"/api/sets/{set_id}/sounds").json() == [updated.json()]

    assert client.patch(f"/api/sets/{set_id}", json={"tagIds": []}).status_code == 200
    assert client.get(f"/api/sets/{set_id}/sounds").json() == []
    assert client.patch(f"/api/sets/{set_id}", json={"tagIds": [tag["id"]]}).status_code == 200
    assert client.delete(f"/api/sounds/{sound.id}").status_code == 204
    assert client.get(f"/api/sets/{set_id}/sounds").json() == []
    replacement = _sound(db, user.id, "Replacement", [selected])
    assert [item["id"] for item in client.get(f"/api/sets/{set_id}/sounds").json()] == [
        str(replacement.id)
    ]
    assert client.delete(f"/api/tags/{tag['id']}").status_code == 204
    assert client.get(f"/api/sets/{set_id}/sounds").json() == []


def test_membership_hides_foreign_sets_and_sounds(client: TestClient, db: Session) -> None:
    tag = client.post("/api/tags", json={"name": "shared"}).json()
    set_id = _set(client, [tag["id"]])
    selected = db.get(Tag, tag["id"])
    assert selected is not None
    other = User()
    db.add(other)
    db.flush()
    foreign_layer = Layer(user_id=other.id, name="Foreign", position=0)
    foreign_set = Set(layer=foreign_layer, name="Foreign", position=0)
    db.add(foreign_set)
    db.commit()
    _sound(db, other.id, "Hidden", [selected])

    assert client.get(f"/api/sets/{set_id}/sounds").json() == []
    for hidden_id in (foreign_set.id, uuid4()):
        response = client.get(f"/api/sets/{hidden_id}/sounds")
        assert response.status_code == 404
        assert response.json() == {"detail": "Set not found"}
