"""add_user_soft_delete_fields

Revision ID: fb17c99ea9f3
Revises: bb0da6918b00
Create Date: 2026-01-21 21:56:19.131245

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'fb17c99ea9f3'
down_revision = 'bb0da6918b00'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add soft delete fields to users table
    op.add_column('users', sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('users', sa.Column('deleted_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'deleted_at')
    op.drop_column('users', 'is_deleted')