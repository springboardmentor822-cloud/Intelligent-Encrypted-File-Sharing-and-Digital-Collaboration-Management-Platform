"""Initial schema: users, folders, files, versions, shares, notifications.

Revision ID: 0001
Revises:
"""
from alembic import op

import app.models  # noqa: F401
from app.core.database import Base

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The first revision creates the schema from the SQLAlchemy models.
    # Later changes: edit the models, then run `alembic revision --autogenerate -m "describe change"`.
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
