# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '003_add_friendships'
down_revision = '002_add_max_players_to_games'
branch_labels = None
depends_on = None


def upgrade():
    """Add friendships table for user-to-user relationships"""
    op.create_table('friendships',
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('friend_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('user_id', 'friend_id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['friend_id'], ['users.id'], ondelete='CASCADE'),
        sa.CheckConstraint('user_id != friend_id', name='no_self_friendship')
    )

    # Indexes for efficient friendship lookups
    op.create_index('idx_friendships_user_id', 'friendships', ['user_id'])
    op.create_index('idx_friendships_friend_id', 'friendships', ['friend_id'])
    op.create_index('idx_friendships_status', 'friendships', ['status'])


def downgrade():
    """Remove friendships table"""
    op.drop_index('idx_friendships_status', table_name='friendships')
    op.drop_index('idx_friendships_friend_id', table_name='friendships')
    op.drop_index('idx_friendships_user_id', table_name='friendships')
    op.drop_table('friendships')
