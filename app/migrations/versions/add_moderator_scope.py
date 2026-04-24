"""add moderator course and group scope

Revision ID: add_moderator_scope
Revises: add_new_categories, add_support_ticket_assignment
Create Date: 2026-04-24 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "add_moderator_scope"
down_revision: Union[str, Sequence[str], None] = ("add_new_categories", "add_support_ticket_assignment")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS moderator_courses VARCHAR")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS moderator_groups VARCHAR")


def downgrade() -> None:
    op.drop_column("users", "moderator_groups")
    op.drop_column("users", "moderator_courses")
