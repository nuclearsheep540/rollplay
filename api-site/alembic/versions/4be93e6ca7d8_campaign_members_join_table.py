"""campaign members join table

Revision ID: 4be93e6ca7d8
Revises: 6c2e3c2ce373
Create Date: 2026-03-10 13:30:34.982128

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import uuid

# revision identifiers, used by Alembic.
revision = '4be93e6ca7d8'
down_revision = '6c2e3c2ce373'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create the new join table
    op.create_table('campaign_members',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('campaign_id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('role', sa.String(length=10), nullable=False),
    sa.Column('joined_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['campaign_id'], ['campaigns.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('campaign_id', 'user_id', name='uq_campaign_member')
    )

    # 2. Migrate data from JSONB columns to join table
    conn = op.get_bind()

    # Read all campaigns with their JSONB arrays
    campaigns = conn.execute(
        sa.text("SELECT id, player_ids, invited_player_ids FROM campaigns")
    ).fetchall()

    # Collect all valid user IDs for FK validation
    valid_users = set()
    rows = conn.execute(sa.text("SELECT id FROM users")).fetchall()
    for row in rows:
        valid_users.add(str(row[0]))

    for campaign in campaigns:
        campaign_id = campaign[0]
        player_ids = campaign[1] or []
        invited_player_ids = campaign[2] or []

        for player_id in player_ids:
            # Skip orphaned UUIDs that don't match a valid user
            if str(player_id) not in valid_users:
                continue
            conn.execute(
                sa.text(
                    "INSERT INTO campaign_members (id, campaign_id, user_id, role) "
                    "VALUES (:id, :campaign_id, :user_id, 'player') "
                    "ON CONFLICT (campaign_id, user_id) DO NOTHING"
                ),
                {"id": str(uuid.uuid4()), "campaign_id": str(campaign_id), "user_id": str(player_id)}
            )

        for player_id in invited_player_ids:
            if str(player_id) not in valid_users:
                continue
            conn.execute(
                sa.text(
                    "INSERT INTO campaign_members (id, campaign_id, user_id, role) "
                    "VALUES (:id, :campaign_id, :user_id, 'invited') "
                    "ON CONFLICT (campaign_id, user_id) DO NOTHING"
                ),
                {"id": str(uuid.uuid4()), "campaign_id": str(campaign_id), "user_id": str(player_id)}
            )

    # 3. Drop the old JSONB columns
    op.drop_column('campaigns', 'invited_player_ids')
    op.drop_column('campaigns', 'player_ids')


def downgrade() -> None:
    # 1. Re-add JSONB columns
    op.add_column('campaigns', sa.Column('player_ids', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), autoincrement=False, nullable=False))
    op.add_column('campaigns', sa.Column('invited_player_ids', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), autoincrement=False, nullable=False))

    # 2. Migrate data back from join table to JSONB
    conn = op.get_bind()

    members = conn.execute(
        sa.text("SELECT campaign_id, user_id, role FROM campaign_members")
    ).fetchall()

    for member in members:
        campaign_id, user_id, role = member
        if role == 'player':
            conn.execute(
                sa.text(
                    "UPDATE campaigns SET player_ids = player_ids || :user_id::jsonb "
                    "WHERE id = :campaign_id"
                ),
                {"user_id": f'["{user_id}"]', "campaign_id": str(campaign_id)}
            )
        elif role == 'invited':
            conn.execute(
                sa.text(
                    "UPDATE campaigns SET invited_player_ids = invited_player_ids || :user_id::jsonb "
                    "WHERE id = :campaign_id"
                ),
                {"user_id": f'["{user_id}"]', "campaign_id": str(campaign_id)}
            )

    # 3. Drop join table
    op.drop_table('campaign_members')
