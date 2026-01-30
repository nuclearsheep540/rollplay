"""create_media_assets_table

Revision ID: d3b6ff8f195e
Revises: 9ec4fd5e5a76
Create Date: 2026-01-28 14:23:53.219403

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'd3b6ff8f195e'
down_revision = '9ec4fd5e5a76'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create the enum type first
    media_asset_type = postgresql.ENUM('map', 'audio', 'image', name='media_asset_type', create_type=False)
    media_asset_type.create(op.get_bind(), checkfirst=True)

    # Create the media_assets table
    op.create_table(
        'media_assets',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('filename', sa.String(length=255), nullable=False),
        sa.Column('s3_key', sa.String(length=512), nullable=False),
        sa.Column('content_type', sa.String(length=100), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('asset_type', postgresql.ENUM('map', 'audio', 'image', name='media_asset_type', create_type=False), nullable=False),
        sa.Column('campaign_ids', postgresql.ARRAY(postgresql.UUID(as_uuid=True)), nullable=False, server_default='{}'),
        sa.Column('session_ids', postgresql.ARRAY(postgresql.UUID(as_uuid=True)), nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('s3_key')
    )

    # Create indexes for common query patterns
    op.create_index('ix_media_assets_user_id', 'media_assets', ['user_id'])
    op.create_index('ix_media_assets_asset_type', 'media_assets', ['asset_type'])


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_media_assets_asset_type', table_name='media_assets')
    op.drop_index('ix_media_assets_user_id', table_name='media_assets')

    # Drop table
    op.drop_table('media_assets')

    # Drop enum type
    media_asset_type = postgresql.ENUM('map', 'audio', 'image', name='media_asset_type')
    media_asset_type.drop(op.get_bind(), checkfirst=True)
