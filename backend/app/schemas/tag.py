"""Tag API schemas (api-contract.md → Tags).

`TagRead` is the payload every Tags endpoint returns. `user_id` is never exposed —
every Tags endpoint is already scoped to the current user (deps.get_current_user), so
it would be redundant.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class TagRead(BaseModel):
    """A single tag as returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    created_at: datetime


class TagWrite(BaseModel):
    """Body of `POST /api/tags` and `PATCH /api/tags/{id}` — both just set `name`."""

    name: str
