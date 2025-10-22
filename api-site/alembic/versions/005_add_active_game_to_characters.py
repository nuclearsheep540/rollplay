# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""add active_game column to characters

Revision ID: 005_add_active_game_to_characters
Revises: 004_add_game_invite_system
Create Date: 2025-10-22

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'abc123456789'
down_revision = '64932c24bcc7'
branch_labels = None
depends_on = None


def upgrade():
    """Add active_game column to characters table"""
    op.add_column('characters',
        sa.Column('active_game', postgresql.UUID(as_uuid=True), nullable=True)
    )

    # Add foreign key constraint
    op.create_foreign_key(
        'fk_characters_active_game_games',
        'characters', 'games',
        ['active_game'], ['id'],
        ondelete='SET NULL'
    )


def downgrade():
    """Remove active_game column from characters table"""
    op.drop_constraint('fk_characters_active_game_games', 'characters', type_='foreignkey')
    op.drop_column('characters', 'active_game')
