"""add support ticket lifecycle columns

Revision ID: add_support_ticket_lifecycle
Revises: add_audit_logs
Create Date: 2026-03-19 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "add_support_ticket_lifecycle"
down_revision: Union[str, Sequence[str], None] = "add_audit_logs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS session_expires_at TIMESTAMPTZ")
    op.execute("ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ")
    op.execute("ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ")
    op.execute("CREATE INDEX IF NOT EXISTS ix_support_tickets_session_expires_at ON support_tickets (session_expires_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_support_tickets_closed_at ON support_tickets (closed_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_support_tickets_archived_at ON support_tickets (archived_at)")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("support_tickets")}
    indexes = {index["name"] for index in inspector.get_indexes("support_tickets")}

    if "ix_support_tickets_archived_at" in indexes:
        op.drop_index("ix_support_tickets_archived_at", table_name="support_tickets")
    if "ix_support_tickets_closed_at" in indexes:
        op.drop_index("ix_support_tickets_closed_at", table_name="support_tickets")
    if "ix_support_tickets_session_expires_at" in indexes:
        op.drop_index("ix_support_tickets_session_expires_at", table_name="support_tickets")

    if "archived_at" in columns:
        op.drop_column("support_tickets", "archived_at")
    if "closed_at" in columns:
        op.drop_column("support_tickets", "closed_at")
    if "session_expires_at" in columns:
        op.drop_column("support_tickets", "session_expires_at")
