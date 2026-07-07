"""SQLAlchemy models. Import all models here so `Base.metadata` is complete
(Alembic autogenerate and the test schema builder rely on this).
"""

from app.models.base import Base
from app.models.user import User

__all__ = ["Base", "User"]
