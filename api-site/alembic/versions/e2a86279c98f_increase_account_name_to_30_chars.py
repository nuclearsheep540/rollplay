"""increase_account_name_to_30_chars

Revision ID: e2a86279c98f
Revises: b2c3d4e5f6a7
Create Date: 2026-01-06 16:23:31.514948

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e2a86279c98f'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Increase account_name column from VARCHAR(20) to VARCHAR(30)
    op.alter_column('users', 'account_name',
                    existing_type=sa.String(20),
                    type_=sa.String(30),
                    existing_nullable=True)


def downgrade() -> None:
    # Revert account_name column back to VARCHAR(20)
    op.alter_column('users', 'account_name',
                    existing_type=sa.String(30),
                    type_=sa.String(20),
                    existing_nullable=True)