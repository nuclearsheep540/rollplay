# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""add_player_ids_to_campaigns

Revision ID: 003_add_player_ids_to_campaigns
Revises: 002_hot_cold_storage_fields
Create Date: 2025-01-20 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = '003_add_player_ids_to_campaigns'
down_revision = '002_hot_cold_storage_fields'
branch_labels = None
depends_on = None


def upgrade():
    """Add player_ids column to campaigns table"""
    # Add player_ids as JSON array to store list of player UUIDs
    op.add_column('campaigns', 
        sa.Column('player_ids', postgresql.JSON, nullable=True, default=lambda: [])
    )
    
    # Set default empty array for existing campaigns
    op.execute("UPDATE campaigns SET player_ids = '[]'::json WHERE player_ids IS NULL")
    
    # Make column not nullable after setting defaults
    op.alter_column('campaigns', 'player_ids', nullable=False)


def downgrade():
    """Remove player_ids column from campaigns table"""
    op.drop_column('campaigns', 'player_ids')