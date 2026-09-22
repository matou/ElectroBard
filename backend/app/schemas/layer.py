"""Layer request and response schemas."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.json_schema import SkipJsonSchema

from app.models import PlaybackMode
from app.schemas.name import LayerSetDisplayName

LayerVolume = Annotated[int, Field(strict=True, ge=0, le=100)]


class LayerRead(BaseModel):
    """The canonical representation returned by every Layer endpoint."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    position: int
    playback_mode: PlaybackMode
    volume: int
    created_at: datetime


class LayerCreate(BaseModel):
    """Create a Layer at the end of the current User's order."""

    model_config = ConfigDict(extra="forbid")

    name: LayerSetDisplayName
    playback_mode: PlaybackMode = PlaybackMode.SINGLE
    volume: LayerVolume = 80


class LayerUpdate(BaseModel):
    """A partial Layer settings update; explicit nulls are invalid."""

    model_config = ConfigDict(extra="forbid")

    # The None default makes each PATCH field omittable. SkipJsonSchema keeps null
    # out of OpenAPI because the pre-validator deliberately rejects explicit nulls.
    name: LayerSetDisplayName | SkipJsonSchema[None] = None
    playback_mode: PlaybackMode | SkipJsonSchema[None] = None
    volume: LayerVolume | SkipJsonSchema[None] = None

    @model_validator(mode="before")
    @classmethod
    def reject_explicit_nulls(cls, value: object) -> object:
        if isinstance(value, dict) and any(field_value is None for field_value in value.values()):
            raise ValueError("Layer fields may not be null")
        return value
