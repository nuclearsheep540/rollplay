"""rename campaign and game terminology add new fields

Revision ID: 64932c24bcc7
Revises: d1decfe0a53e
Create Date: 2025-10-21 16:25:21.130811

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = '64932c24bcc7'
down_revision = 'd1decfe0a53e'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Campaign table changes
    # Rename columns
    op.alter_column('campaigns', 'name', new_column_name='title')
    op.alter_column('campaigns', 'dm_id', new_column_name='host_id')
    op.alter_column('campaigns', 'maps', new_column_name='assets')

    # Change assets column type from Text to JSON
    op.alter_column('campaigns', 'assets',
                    existing_type=sa.Text(),
                    type_=postgresql.JSON(astext_type=sa.Text()),
                    existing_nullable=True,
                    postgresql_using='assets::json')

    # Add new columns
    op.add_column('campaigns', sa.Column('scenes', postgresql.JSON(astext_type=sa.Text()), nullable=True))
    op.add_column('campaigns', sa.Column('npc_factory', postgresql.JSON(astext_type=sa.Text()), nullable=True))

    # Game table changes
    # Rename column
    op.alter_column('games', 'dungeon_master_id', new_column_name='host_id')


def downgrade() -> None:
    # Reverse order - games first
    op.alter_column('games', 'host_id', new_column_name='dungeon_master_id')

    # Campaigns
    op.drop_column('campaigns', 'npc_factory')
    op.drop_column('campaigns', 'scenes')

    # Change assets back to Text
    op.alter_column('campaigns', 'assets',
                    existing_type=postgresql.JSON(astext_type=sa.Text()),
                    type_=sa.Text(),
                    existing_nullable=True)

    op.alter_column('campaigns', 'assets', new_column_name='maps')
    op.alter_column('campaigns', 'host_id', new_column_name='dm_id')
    op.alter_column('campaigns', 'title', new_column_name='name')