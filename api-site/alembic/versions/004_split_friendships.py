# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '004_split_friendships'
down_revision = '003_add_friendships'
branch_labels = None
depends_on = None


def upgrade():
    """
    Split friendships table into:
    - friend_requests (directional, for pending requests)
    - friendships (non-directional with canonical ordering, for accepted friendships)
    """

    # Step 1: Create friend_requests table (directional)
    op.create_table('friend_requests',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('requester_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('recipient_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['requester_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['recipient_id'], ['users.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('requester_id', 'recipient_id', name='uq_friend_requests_requester_recipient'),
        sa.CheckConstraint('requester_id != recipient_id', name='no_self_request')
    )

    # Indexes for friend_requests (optimized for directional queries)
    op.create_index('idx_friend_requests_recipient', 'friend_requests', ['recipient_id', 'created_at'], postgresql_ops={'created_at': 'DESC'})
    op.create_index('idx_friend_requests_requester', 'friend_requests', ['requester_id', 'created_at'], postgresql_ops={'created_at': 'DESC'})

    # Step 2: Create new friendships table (non-directional with canonical ordering)
    op.create_table('friendships_new',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('user1_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user2_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['user1_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user2_id'], ['users.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('user1_id', 'user2_id', name='uq_friendships_user1_user2'),
        sa.CheckConstraint('user1_id != user2_id', name='no_self_friendship_new'),
        sa.CheckConstraint('user1_id < user2_id', name='ordered_friendship')  # Canonical ordering
    )

    # Indexes for friendships (optimized for non-directional queries)
    op.create_index('idx_friendships_new_user1', 'friendships_new', ['user1_id'])
    op.create_index('idx_friendships_new_user2', 'friendships_new', ['user2_id'])

    # Step 3-5: Skip data migration if old friendships table doesn't exist
    # (This can happen if the table was accidentally dropped)
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if 'friendships' in inspector.get_table_names():
        # Step 3: Migrate PENDING records from old friendships → friend_requests
        op.execute("""
            INSERT INTO friend_requests (requester_id, recipient_id, created_at)
            SELECT user_id, friend_id, created_at
            FROM friendships
            WHERE status = 'pending'
        """)

        # Step 4: Migrate ACCEPTED records from old friendships → friendships_new (with canonical ordering)
        op.execute("""
            INSERT INTO friendships_new (user1_id, user2_id, created_at)
            SELECT
                LEAST(user_id, friend_id) AS user1_id,
                GREATEST(user_id, friend_id) AS user2_id,
                created_at
            FROM friendships
            WHERE status = 'accepted'
        """)

        # Step 5: Drop old friendships table and indexes
        op.drop_index('idx_friendships_status', table_name='friendships')
        op.drop_index('idx_friendships_friend_id', table_name='friendships')
        op.drop_index('idx_friendships_user_id', table_name='friendships')
        op.drop_table('friendships')

    # Step 6: Rename friendships_new → friendships
    op.rename_table('friendships_new', 'friendships')

    # Step 7: Rename indexes to final names (drop 'new' suffix)
    op.execute('ALTER INDEX idx_friendships_new_user1 RENAME TO idx_friendships_user1')
    op.execute('ALTER INDEX idx_friendships_new_user2 RENAME TO idx_friendships_user2')


def downgrade():
    """
    Reverse the split: merge friend_requests and friendships back into single table
    """

    # Step 1: Recreate old friendships table
    op.create_table('friendships_old',
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('friend_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('user_id', 'friend_id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['friend_id'], ['users.id'], ondelete='CASCADE'),
        sa.CheckConstraint('user_id != friend_id', name='no_self_friendship')
    )

    # Step 2: Migrate friend_requests → old friendships (status='pending')
    op.execute("""
        INSERT INTO friendships_old (user_id, friend_id, status, created_at)
        SELECT requester_id, recipient_id, 'pending', created_at
        FROM friend_requests
    """)

    # Step 3: Migrate friendships → old friendships (status='accepted')
    # Note: We'll restore as user1_id→user2_id only (loses bidirectional redundancy)
    op.execute("""
        INSERT INTO friendships_old (user_id, friend_id, status, created_at)
        SELECT user1_id, user2_id, 'accepted', created_at
        FROM friendships
    """)

    # Step 4: Drop new tables
    op.drop_index('idx_friend_requests_requester', table_name='friend_requests')
    op.drop_index('idx_friend_requests_recipient', table_name='friend_requests')
    op.drop_table('friend_requests')

    op.drop_index('idx_friendships_user2', table_name='friendships')
    op.drop_index('idx_friendships_user1', table_name='friendships')
    op.drop_table('friendships')

    # Step 5: Rename old table back to friendships
    op.rename_table('friendships_old', 'friendships')

    # Step 6: Recreate original indexes
    op.create_index('idx_friendships_user_id', 'friendships', ['user_id'])
    op.create_index('idx_friendships_friend_id', 'friendships', ['friend_id'])
    op.create_index('idx_friendships_status', 'friendships', ['status'])
