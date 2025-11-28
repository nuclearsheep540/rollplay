# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""add background and origin bonuses

Revision ID: 008_add_background_and_origin_bonuses
Revises: 007_multiclass_support
Create Date: 2025-11-26 (Generated manually)

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '008_bg_origin_bonuses'
down_revision = '007_multiclass_support'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Add D&D 2024 background and origin_ability_bonuses columns to characters table.

    Background: Character background (e.g., "Soldier", "Sage")
    Origin Ability Bonuses: Dict of ability score bonuses from background (+2/+1 or +1/+1/+1)
    """
    # Add background column (nullable for existing characters)
    op.add_column('characters', sa.Column('background', sa.String(length=50), nullable=True))

    # Add origin_ability_bonuses column (JSONB, nullable for existing characters)
    op.add_column('characters', sa.Column(
        'origin_ability_bonuses',
        postgresql.JSONB(astext_type=sa.Text()),
        nullable=True,
        server_default=sa.text("'{}'::jsonb")
    ))


def downgrade() -> None:
    """Remove D&D 2024 background fields"""
    op.drop_column('characters', 'origin_ability_bonuses')
    op.drop_column('characters', 'background')
