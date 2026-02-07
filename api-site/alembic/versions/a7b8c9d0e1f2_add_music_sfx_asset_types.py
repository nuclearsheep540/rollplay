# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""add music and sfx asset types

Revision ID: a7b8c9d0e1f2
Revises: cfde3eb37731
Create Date: 2026-02-05

Adds 'music' and 'sfx' values to the media_asset_type enum
and migrates existing 'audio' assets to 'music'.
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'a7b8c9d0e1f2'
down_revision = 'cfde3eb37731'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new enum values using autocommit block (PostgreSQL requires commit before enum values can be used)
    # This is the proper Alembic pattern - avoids raw COMMIT which breaks offline mode
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE media_asset_type ADD VALUE IF NOT EXISTS 'music'")
        op.execute("ALTER TYPE media_asset_type ADD VALUE IF NOT EXISTS 'sfx'")

    # Migrate existing audio assets to music (runs in normal transaction after enum values are committed)
    op.execute("UPDATE media_assets SET asset_type = 'music' WHERE asset_type = 'audio'")


def downgrade() -> None:
    # Migrate music/sfx back to audio
    op.execute("UPDATE media_assets SET asset_type = 'audio' WHERE asset_type IN ('music', 'sfx')")
    # Note: Cannot remove enum values from PostgreSQL, 'music' and 'sfx' will remain in the type
