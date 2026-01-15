# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""increase_campaign_description_limit

Revision ID: g4e5f6a7b8c9
Revises: f3d4e5f6a7b8
Create Date: 2026-01-13 14:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'g4e5f6a7b8c9'
down_revision = 'f3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # No schema change needed - description is already TEXT type
    # This migration serves as documentation that validation changed from 500 to 1000 chars
    pass


def downgrade() -> None:
    # No schema change to revert
    pass
