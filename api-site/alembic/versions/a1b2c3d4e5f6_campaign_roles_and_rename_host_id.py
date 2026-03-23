"""campaign roles and rename host_id to created_by

Revision ID: a1b2c3d4e5f6
Revises: 7fed31949a00
Create Date: 2026-03-23 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'whydoesclaudealwayswanttocreatealembicrevisinsmanually'
down_revision = '7fed31949a00'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Drop old check constraint and add new one with all roles
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

    # 3. Update existing 'player' rows: if the user has a character locked to
    #    this campaign, keep them as 'player'; otherwise set to 'spectator'
    op.execute("""
        UPDATE campaign_members cm
        SET role = 'spectator'
        WHERE cm.role = 'player'
        AND NOT EXISTS (
            SELECT 1 FROM characters c
            WHERE c.user_id = cm.user_id
            AND c.active_campaign = cm.campaign_id
            AND c.is_deleted = false
        )
    """)

    # 4. Rename host_id column to created_by
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

    # Restore old check constraint
    op.drop_constraint('ck_campaign_member_role', 'campaign_members', type_='check')
    op.create_check_constraint(
        'ck_campaign_member_role',
        'campaign_members',
        "role IN ('player', 'invited')"
    )
