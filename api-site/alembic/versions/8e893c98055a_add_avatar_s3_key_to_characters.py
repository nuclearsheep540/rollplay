"""add_avatar_s3_key_to_characters

Revision ID: 8e893c98055a
Revises: a07d98ebfd68
Create Date: 2026-05-27 08:13:10.900926

Adds the S3 key column where a character's uploaded avatar lives. Nullable —
characters without an upload fall back to /heroes.png in the response.

The key shape produced by the upload-url endpoint is
``{account_name}#{account_tag}/{character_id}/{unique_id}_{filename}``,
chosen so a human browsing the bucket can navigate by user handle.
"""
from alembic import op
import sqlalchemy as sa


revision = '8e893c98055a'
down_revision = 'a07d98ebfd68'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'characters',
        sa.Column('avatar_s3_key', sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('characters', 'avatar_s3_key')
