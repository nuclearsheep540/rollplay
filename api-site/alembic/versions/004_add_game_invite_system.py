# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""add_game_invite_system

Revision ID: 004_add_game_invite_system
Revises: 003_add_player_ids_to_campaigns
Create Date: 2025-10-21 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = '004_add_game_invite_system'
down_revision = '003_add_player_ids_to_campaigns'
branch_labels = None
depends_on = None


def upgrade():
    """Add game invite system with association tables"""

    # 1. Update games table - rename columns and add session_id
    op.alter_column('games', 'dm_id', new_column_name='dungeon_master_id')
    op.alter_column('games', 'ended_at', new_column_name='stopped_at')

    # 2. Drop columns no longer needed
    op.drop_column('games', 'max_players')
    op.drop_column('games', 'updated_at')
    op.drop_column('games', 'mongodb_session_id')

    # 3. Add session_id column (replaces mongodb_session_id)
    op.add_column('games',
        sa.Column('session_id', sa.String(100), nullable=True)
    )

    # 4. Create game_invites association table
    op.create_table(
        'game_invites',
        sa.Column('game_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('invited_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('invited_by', postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(['game_id'], ['games.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['invited_by'], ['users.id']),
        sa.PrimaryKeyConstraint('game_id', 'user_id')
    )

    # 5. Create game_characters association table
    op.create_table(
        'game_characters',
        sa.Column('game_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('character_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('joined_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['game_id'], ['games.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['character_id'], ['characters.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('game_id', 'character_id')
    )

    # 6. Create indexes for better query performance
    op.create_index('idx_game_invites_user_id', 'game_invites', ['user_id'])
    op.create_index('idx_game_characters_character_id', 'game_characters', ['character_id'])


def downgrade():
    """Remove game invite system"""

    # Drop indexes
    op.drop_index('idx_game_characters_character_id', table_name='game_characters')
    op.drop_index('idx_game_invites_user_id', table_name='game_invites')

    # Drop association tables
    op.drop_table('game_characters')
    op.drop_table('game_invites')

    # Remove session_id column
    op.drop_column('games', 'session_id')

    # Restore old columns
    op.add_column('games', sa.Column('mongodb_session_id', sa.String(100), nullable=True))
    op.add_column('games', sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.add_column('games', sa.Column('max_players', sa.Integer(), default=6, nullable=False))

    # Restore old column names
    op.alter_column('games', 'stopped_at', new_column_name='ended_at')
    op.alter_column('games', 'dungeon_master_id', new_column_name='dm_id')
