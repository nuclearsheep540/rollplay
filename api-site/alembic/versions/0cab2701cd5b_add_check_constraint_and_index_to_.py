"""add check constraint and index to campaign_members

Revision ID: 0cab2701cd5b
Revises: 4be93e6ca7d8
Create Date: 2026-03-10 13:57:47.074970

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0cab2701cd5b'
down_revision = '4be93e6ca7d8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_check_constraint(
        'ck_campaign_member_role',
        'campaign_members',
        "role IN ('player', 'invited')"
    )
    op.create_index(
        'ix_campaign_members_user_id_role',
        'campaign_members',
        ['user_id', 'role']
    )


def downgrade() -> None:
    op.drop_index('ix_campaign_members_user_id_role', table_name='campaign_members')
    op.drop_constraint('ck_campaign_member_role', 'campaign_members', type_='check')