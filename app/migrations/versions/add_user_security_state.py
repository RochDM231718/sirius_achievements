"""add user security state columns

Revision ID: add_user_security_state
Revises: add_support_ticket_lifecycle
Create Date: 2026-03-19 17:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "add_user_security_state"
down_revision: Union[str, Sequence[str], None] = "add_support_ticket_lifecycle"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("session_version", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("users", sa.Column("api_access_version", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("users", sa.Column("api_refresh_version", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("user_tokens", sa.Column("used_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("user_tokens", "used_at")
    op.drop_column("users", "api_refresh_version")
    op.drop_column("users", "api_access_version")
    op.drop_column("users", "session_version")
