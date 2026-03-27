"""add patriotism and projects categories

Revision ID: add_new_categories
Revises: add_support_ticket_lifecycle
Create Date: 2026-03-26

"""
from typing import Sequence, Union

from alembic import op

revision: str = 'add_new_categories'
down_revision: Union[str, Sequence[str], None] = 'add_user_security_state'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE achievementcategory ADD VALUE IF NOT EXISTS 'PATRIOTISM'")
        op.execute("ALTER TYPE achievementcategory ADD VALUE IF NOT EXISTS 'PROJECTS'")


def downgrade() -> None:
    # PostgreSQL does not support removing values from enum types
    pass
