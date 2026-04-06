"""add support ticket lifecycle columns

Revision ID: add_support_ticket_lifecycle
Revises: add_audit_logs
Create Date: 2026-03-19 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "add_support_ticket_lifecycle"
down_revision: Union[str, Sequence[str], None] = "add_audit_logs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("support_tickets", sa.Column("session_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("support_tickets", sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("support_tickets", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_support_tickets_session_expires_at", "support_tickets", ["session_expires_at"], unique=False)
    op.create_index("ix_support_tickets_closed_at", "support_tickets", ["closed_at"], unique=False)
    op.create_index("ix_support_tickets_archived_at", "support_tickets", ["archived_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_support_tickets_archived_at", table_name="support_tickets")
    op.drop_index("ix_support_tickets_closed_at", table_name="support_tickets")
    op.drop_index("ix_support_tickets_session_expires_at", table_name="support_tickets")
    op.drop_column("support_tickets", "archived_at")
    op.drop_column("support_tickets", "closed_at")
    op.drop_column("support_tickets", "session_expires_at")
