"""Shared validation for Layer and Set display names."""

import unicodedata
from typing import Annotated

from pydantic import AfterValidator, StringConstraints


def reject_control_characters(value: str) -> str:
    """Reject controls after StringConstraints canonicalizes and bounds the label."""
    if any(unicodedata.category(character) == "Cc" for character in value):
        raise ValueError("Name must not contain control characters")
    return value


LayerSetDisplayName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=100),
    AfterValidator(reject_control_characters),
]
