"""switch_avatar_to_media_asset_fk

Revision ID: bb56388d8044
Revises: 8e893c98055a
Create Date: 2026-05-27 09:58:46.487438

Replaces the standalone ``characters.avatar_s3_key`` column with a foreign
key into ``media_assets`` so character avatars use the same library + 3-step
upload flow as the rest of the app (maps, images, audio). No data preserved
— the previous column was added the same day with no production data.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = 'bb56388d8044'
down_revision = '8e893c98055a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column('characters', 'avatar_s3_key')
    op.add_column(
        'characters',
        sa.Column('avatar_asset_id', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        'fk_characters_avatar_asset_id',
        'characters', 'media_assets',
        ['avatar_asset_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_characters_avatar_asset_id', 'characters', type_='foreignkey')
    op.drop_column('characters', 'avatar_asset_id')
    op.add_column(
        'characters',
        sa.Column('avatar_s3_key', sa.String(length=255), nullable=True),
    )
