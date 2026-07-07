"""Sound API schemas.

Minimal at M0: the walking-skeleton `GET /api/sounds` returns an empty library, so
`SoundRead` only needs enough to be a real, named array element in the OpenAPI schema
(which feeds the typed client). The full field set lands with the Sound model in M1.
"""

from uuid import UUID

from pydantic import BaseModel, ConfigDict


class SoundRead(BaseModel):
    """A single library entry as returned by the API."""

    model_config = ConfigDict(from_attributes=True)  # read straight off ORM objects (M1)

    id: UUID
    name: str
