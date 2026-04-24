"""add audit_logs table

Revision ID: add_audit_logs
Revises: add_support_tables
Create Date: 2026-03-19 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'add_audit_logs'
down_revision: Union[str, Sequence[str], None] = 'add_resume_generated_at'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_index(table_name: str, index_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return any(index.get('name') == index_name for index in inspector.get_indexes(table_name))


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table('audit_logs'):
        op.create_table('audit_logs',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=True),
            sa.Column('action', sa.String(length=100), nullable=False),
            sa.Column('target_type', sa.String(length=50), nullable=True),
            sa.Column('target_id', sa.Integer(), nullable=True),
            sa.Column('details', sa.Text(), nullable=True),
            sa.Column('ip_address', sa.String(length=45), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
            sa.PrimaryKeyConstraint('id')
        )
    if not _has_index('audit_logs', 'ix_audit_logs_action'):
        op.create_index('ix_audit_logs_action', 'audit_logs', ['action'], unique=False)
    if not _has_index('audit_logs', 'ix_audit_logs_created_at'):
        op.create_index('ix_audit_logs_created_at', 'audit_logs', ['created_at'], unique=False)


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table('audit_logs'):
        return
    if _has_index('audit_logs', 'ix_audit_logs_created_at'):
        op.drop_index('ix_audit_logs_created_at', table_name='audit_logs')
    if _has_index('audit_logs', 'ix_audit_logs_action'):
        op.drop_index('ix_audit_logs_action', table_name='audit_logs')
    op.drop_table('audit_logs')
