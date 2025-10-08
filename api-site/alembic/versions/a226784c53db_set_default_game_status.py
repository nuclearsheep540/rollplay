"""set_default_game_status

Revision ID: a226784c53db
Revises: 002_hot_cold_storage_fields
Create Date: 2025-07-17 20:14:48.114856

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a226784c53db'
down_revision = '002_hot_cold_storage_fields'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Set default value for games.status column to 'inactive'
    op.execute("ALTER TABLE games ALTER COLUMN status SET DEFAULT 'inactive';")


def downgrade() -> None:
    # Remove default value for games.status column
    op.execute("ALTER TABLE games ALTER COLUMN status DROP DEFAULT;")