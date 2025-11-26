# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""add multi-class support to characters

Revision ID: 007_multiclass_support
Revises: 006_add_friend_codes
Create Date: 2025-11-25

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '007_multiclass_support'
down_revision = '006_add_friend_codes'
branch_labels = None
depends_on = None


def upgrade():
    """
    Migrate characters from single class to multi-class support.

    Changes:
    - Add character_classes JSONB column (array of {class, level} objects)
    - Migrate existing single class to array format
    - Drop old character_class column

    Example: Fighter level 5 becomes [{"class": "Fighter", "level": 5}]
    """

    # Step 1: Add new character_classes column (nullable temporarily)
    op.add_column('characters',
        sa.Column('character_classes', postgresql.JSONB, nullable=True))

    # Step 2: Migrate existing data from single class to array format
    # Each character gets one class entry with their total level
    op.execute("""
        UPDATE characters
        SET character_classes = jsonb_build_array(
            jsonb_build_object(
                'class', character_class,
                'level', level
            )
        )
        WHERE character_class IS NOT NULL
    """)

    # Step 3: Make character_classes non-nullable (now that data is migrated)
    op.alter_column('characters', 'character_classes', nullable=False)

    # Step 4: Drop old single-class column
    op.drop_column('characters', 'character_class')


def downgrade():
    """
    Revert multi-class support back to single class.

    Warning: If characters have multiple classes, only the first class is preserved.
    """

    # Step 1: Add back single character_class column
    op.add_column('characters',
        sa.Column('character_class', sa.String(50), nullable=True))

    # Step 2: Migrate first class from array back to single field
    op.execute("""
        UPDATE characters
        SET character_class = character_classes->0->>'class'
        WHERE jsonb_array_length(character_classes) > 0
    """)

    # Step 3: Make character_class non-nullable
    op.alter_column('characters', 'character_class', nullable=False)

    # Step 4: Drop multi-class column
    op.drop_column('characters', 'character_classes')
