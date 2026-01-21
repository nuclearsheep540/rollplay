"""make session name nullable

Revision ID: bb0da6918b00
Revises: h5f6g7h8i9j0
Create Date: 2026-01-21 19:49:50.573196

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'bb0da6918b00'
down_revision = 'h5f6g7h8i9j0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('sessions', 'name',
               existing_type=sa.VARCHAR(length=100),
               nullable=True)


def downgrade() -> None:
    op.alter_column('sessions', 'name',
               existing_type=sa.VARCHAR(length=100),
               nullable=False)