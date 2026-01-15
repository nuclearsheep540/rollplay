# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""add_campaign_hero_image

Revision ID: f3d4e5f6a7b8
Revises: e2a86279c98f
Create Date: 2026-01-13 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f3d4e5f6a7b8'
down_revision = 'e2a86279c98f'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add hero_image column to campaigns table
    op.add_column('campaigns', sa.Column('hero_image', sa.String(255), nullable=True))


def downgrade() -> None:
    # Remove hero_image column from campaigns table
    op.drop_column('campaigns', 'hero_image')
