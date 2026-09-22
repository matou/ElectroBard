"""Set request and response schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.json_schema import SkipJsonSchema

from app.schemas.name import LayerSetDisplayName
from app.schemas.tag import TagRead


class SetRead(BaseModel):
    """The canonical representation returned by every Set endpoint."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    layer_id: UUID
    name: str
    position: int
    loop: bool
    shuffle: bool
    tags: list[TagRead]
    created_at: datetime


class SetCreate(BaseModel):
    """Create a Set at the end of a Layer's order."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    name: LayerSetDisplayName
    tag_ids: list[UUID] = Field(alias="tagIds")
    loop: bool = False
    shuffle: bool = False


class SetUpdate(BaseModel):
    """A partial Set settings update; explicit nulls are invalid."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    name: LayerSetDisplayName | SkipJsonSchema[None] = None
    tag_ids: list[UUID] | SkipJsonSchema[None] = Field(default=None, alias="tagIds")
    loop: bool | SkipJsonSchema[None] = None
    shuffle: bool | SkipJsonSchema[None] = None

    @model_validator(mode="before")
    @classmethod
    def reject_explicit_nulls(cls, value: object) -> object:
        if isinstance(value, dict) and any(field_value is None for field_value in value.values()):
            raise ValueError("Set fields may not be null")
        return value
