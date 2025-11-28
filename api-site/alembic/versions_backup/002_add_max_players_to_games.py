# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '002_add_max_players_to_games'
down_revision = '001_initial_schema'
branch_labels = None
depends_on = None


def upgrade():
    """Add max_players column to games table"""
    op.add_column('games', sa.Column('max_players', sa.Integer(), nullable=False, server_default='8'))


def downgrade():
    """Remove max_players column from games table"""
    op.drop_column('games', 'max_players')
