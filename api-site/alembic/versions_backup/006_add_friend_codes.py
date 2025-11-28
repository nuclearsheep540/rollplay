# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""add friend codes table

Revision ID: 006_add_friend_codes
Revises: 6c21e83c0f21
Create Date: 2025-11-24

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '006_add_friend_codes'
down_revision = '6c21e83c0f21'
branch_labels = None
depends_on = None


def upgrade():
    """
    Add friend_codes table for human-readable friend codes.

    Friend codes are generated lazily on user login via UserRepository._ensure_friend_code()
    No need to generate codes upfront - they're created when users first log in.

    Format: predicate-object (e.g., "happy-elephant", "brave-lion")
    Uses friendlywords package for generation.
    """

    # Create friend_codes table
    op.create_table(
        'friend_codes',
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('friend_code', sa.String(50), nullable=False),  # Increased from 12 to 50 for word combinations
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('user_id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('friend_code', name='unique_friend_code')
    )

    # Create index for fast friend code lookup
    op.create_index('idx_friend_code', 'friend_codes', ['friend_code'])

    # Note: Friend codes are generated lazily when users log in
    # No need to populate for existing users here


def downgrade():
    """Remove friend_codes table"""
    op.drop_index('idx_friend_code', table_name='friend_codes')
    op.drop_table('friend_codes')
