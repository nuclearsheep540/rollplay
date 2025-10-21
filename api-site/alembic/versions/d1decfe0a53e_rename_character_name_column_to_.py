"""rename character name column to character_name

Revision ID: d1decfe0a53e
Revises: ec39b600d2ea
Create Date: 2025-10-21 12:27:47.763364

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd1decfe0a53e'
down_revision = 'ec39b600d2ea'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Rename 'name' column to 'character_name' to match SQLAlchemy model
    op.alter_column('characters', 'name', new_column_name='character_name')


def downgrade() -> None:
    # Restore original 'name' column name
    op.alter_column('characters', 'character_name', new_column_name='name')