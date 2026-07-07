"""Sounds router — the user's audio library (api-contract: Sounds).

M0 ships only the list endpoint as the walking skeleton (#6). It resolves the current
user (the DB roundtrip) and returns their library, which is empty until uploads land in
M1. Mounted under `/api` by the app factory.
"""

from fastapi import APIRouter, Depends

from app.deps import get_current_user
from app.models import User
from app.schemas.sound import SoundRead

router = APIRouter(tags=["sounds"])


@router.get("/sounds", response_model=list[SoundRead])
def list_sounds(current_user: User = Depends(get_current_user)) -> list[SoundRead]:
    """List the current user's sounds. Empty until the Sound model arrives in M1."""
    return []
