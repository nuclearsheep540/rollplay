# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""campaign roles and rename host_id to created_by

Revision ID: 88c248956ec9
Revises: 82593774abd1
Create Date: 2026-03-24 20:12:31.285876

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '88c248956ec9'
down_revision = '82593774abd1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Drop old check constraint and index, add new constraint with all roles
    op.drop_index('ix_campaign_members_user_id_role', table_name='campaign_members')
    op.drop_constraint('ck_campaign_member_role', 'campaign_members', type_='check')
    op.create_check_constraint(
        'ck_campaign_member_role',
        'campaign_members',
        "role IN ('invited', 'spectator', 'player', 'mod', 'dm')"
    )

    # 2. Insert DM member row for every existing campaign (from host_id)
    #    Uses ON CONFLICT DO NOTHING in case the host already has a member row
    op.execute("""
        INSERT INTO campaign_members (id, campaign_id, user_id, role, joined_at)
        SELECT gen_random_uuid(), id, host_id, 'dm', created_at
        FROM campaigns
        ON CONFLICT ON CONSTRAINT uq_campaign_member DO NOTHING
    """)

    # 3. Update existing 'player' rows: if the user has no character locked to
    #    this campaign, demote them to 'spectator'
    op.execute("""
        UPDATE campaign_members cm
        SET role = 'spectator'
        WHERE cm.role = 'player'
        AND NOT EXISTS (
            SELECT 1 FROM characters c
            WHERE c.user_id = cm.user_id
            AND c.active_in_campaign_id = cm.campaign_id
            AND c.is_deleted = false
        )
    """)

    # 4. Rename host_id column to created_by (preserves data, unlike drop+add)
    op.alter_column('campaigns', 'host_id', new_column_name='created_by')


def downgrade() -> None:
    # Reverse rename
    op.alter_column('campaigns', 'created_by', new_column_name='host_id')

    # Revert spectators back to players
    op.execute("""
        UPDATE campaign_members SET role = 'player' WHERE role = 'spectator'
    """)

    # Remove DM member rows
    op.execute("""
        DELETE FROM campaign_members WHERE role = 'dm'
    """)

    # Restore old check constraint and index
    op.drop_constraint('ck_campaign_member_role', 'campaign_members', type_='check')
    op.create_check_constraint(
        'ck_campaign_member_role',
        'campaign_members',
        "role IN ('player', 'invited')"
    )
    op.create_index('ix_campaign_members_user_id_role', 'campaign_members', ['user_id', 'role'], unique=False)
