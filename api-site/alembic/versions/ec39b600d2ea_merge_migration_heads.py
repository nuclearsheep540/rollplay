"""merge migration heads

Revision ID: ec39b600d2ea
Revises: 004_add_game_invite_system, 62b646ab528d
Create Date: 2025-10-21 12:16:44.546814

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'ec39b600d2ea'
down_revision = ('004_add_game_invite_system', '62b646ab528d')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass