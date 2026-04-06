"""add support ticket moderator assignment

Revision ID: add_support_ticket_assignment
Revises: add_user_security_state
Create Date: 2026-03-19 19:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "add_support_ticket_assignment"
down_revision: Union[str, Sequence[str], None] = "add_user_security_state"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("support_tickets", sa.Column("moderator_id", sa.Integer(), nullable=True))
    op.add_column("support_tickets", sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_support_tickets_moderator_id", "support_tickets", ["moderator_id"], unique=False)
    op.create_index("ix_support_tickets_assigned_at", "support_tickets", ["assigned_at"], unique=False)
    op.create_foreign_key(
        "fk_support_tickets_moderator_id_users",
        "support_tickets",
        "users",
        ["moderator_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_support_tickets_moderator_id_users", "support_tickets", type_="foreignkey")
    op.drop_index("ix_support_tickets_assigned_at", table_name="support_tickets")
    op.drop_index("ix_support_tickets_moderator_id", table_name="support_tickets")
    op.drop_column("support_tickets", "assigned_at")
    op.drop_column("support_tickets", "moderator_id")
