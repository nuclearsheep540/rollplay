# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Add hot/cold storage fields

Revision ID: 002_hot_cold_storage_fields
Revises: 001_initial_consolidated
Create Date: 2025-07-16 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '002_hot_cold_storage_fields'
down_revision = '001_initial_consolidated'
branch_labels = None
depends_on = None


def upgrade():
    # Add new fields to campaigns table
    op.add_column('campaigns', sa.Column('invited_players', sa.JSON(), nullable=True))
    op.add_column('campaigns', sa.Column('moderators', sa.JSON(), nullable=True))
    op.add_column('campaigns', sa.Column('maps', sa.JSON(), nullable=True))
    op.add_column('campaigns', sa.Column('audio', sa.JSON(), nullable=True))
    op.add_column('campaigns', sa.Column('media', sa.JSON(), nullable=True))
    op.add_column('campaigns', sa.Column('scenes', sa.JSON(), nullable=True))
    op.add_column('campaigns', sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True))
    
    # Remove old status field from campaigns
    op.drop_column('campaigns', 'status')
    
    # Update games table with new structure
    op.add_column('games', sa.Column('name', sa.String(), nullable=True))
    op.add_column('games', sa.Column('location', sa.String(), nullable=True))
    op.add_column('games', sa.Column('party', sa.JSON(), nullable=True))
    op.add_column('games', sa.Column('adventure_logs', sa.JSON(), nullable=True))
    op.add_column('games', sa.Column('combat_active', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('games', sa.Column('turn_order', sa.JSON(), nullable=True))
    op.add_column('games', sa.Column('total_play_time', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('games', sa.Column('started_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('games', sa.Column('ended_at', sa.DateTime(timezone=True), nullable=True))
    
    # Create enum type for game status
    game_status_enum = sa.Enum('inactive', 'starting', 'active', 'stopping', name='gamestatus')
    game_status_enum.create(op.get_bind(), checkfirst=True)
    
    # Update status field to use enum with proper casting
    op.execute("ALTER TABLE games ALTER COLUMN status TYPE gamestatus USING status::gamestatus")
    op.alter_column('games', 'status', server_default='inactive')
    
    # Remove old fields from games table
    op.drop_column('games', 'session_name')
    op.drop_column('games', 'player_ids')
    op.drop_column('games', 'moderator_ids')
    op.drop_column('games', 'seat_colors')
    op.drop_column('games', 'session_started_at')
    
    # Create indexes for performance
    op.create_index('idx_games_status', 'games', ['status'])
    op.create_index('idx_games_campaign_id', 'games', ['campaign_id'])
    op.create_index('idx_campaigns_dm_id', 'campaigns', ['dm_id'])


def downgrade():
    # Drop indexes
    op.drop_index('idx_campaigns_dm_id', table_name='campaigns')
    op.drop_index('idx_games_campaign_id', table_name='games')
    op.drop_index('idx_games_status', table_name='games')
    
    # Restore old fields to games table
    op.add_column('games', sa.Column('session_started_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('games', sa.Column('seat_colors', sa.JSON(), nullable=True))
    op.add_column('games', sa.Column('moderator_ids', sa.JSON(), nullable=True))
    op.add_column('games', sa.Column('player_ids', sa.JSON(), nullable=True))
    op.add_column('games', sa.Column('session_name', sa.String(), nullable=True))
    
    # Remove new fields from games table
    op.drop_column('games', 'ended_at')
    op.drop_column('games', 'started_at')
    op.drop_column('games', 'total_play_time')
    op.drop_column('games', 'turn_order')
    op.drop_column('games', 'combat_active')
    op.drop_column('games', 'adventure_logs')
    op.drop_column('games', 'party')
    op.drop_column('games', 'location')
    op.drop_column('games', 'name')
    
    # Restore old status default and drop enum
    op.alter_column('games', 'status', type_=sa.String(), server_default='configured')
    
    # Drop enum type
    game_status_enum = sa.Enum('inactive', 'starting', 'active', 'stopping', name='gamestatus')
    game_status_enum.drop(op.get_bind(), checkfirst=True)
    
    # Restore old campaigns structure
    op.add_column('campaigns', sa.Column('status', sa.String(), nullable=True))
    op.drop_column('campaigns', 'updated_at')
    op.drop_column('campaigns', 'scenes')
    op.drop_column('campaigns', 'media')
    op.drop_column('campaigns', 'audio')
    op.drop_column('campaigns', 'maps')
    op.drop_column('campaigns', 'moderators')
    op.drop_column('campaigns', 'invited_players')