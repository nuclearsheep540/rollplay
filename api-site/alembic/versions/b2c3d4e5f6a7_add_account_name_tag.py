# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""add account_name and account_tag to users

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-01-06 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add account_name column (nullable - existing users won't have one yet)
    op.add_column('users', sa.Column('account_name', sa.String(30), nullable=True))

    # Add account_tag column (4-digit discriminator, nullable)
    op.add_column('users', sa.Column('account_tag', sa.String(4), nullable=True))

    # Add unique constraint on (account_name, account_tag) combination
    # This ensures uniqueness of the full identifier like "claude#2345"
    op.create_unique_constraint(
        'uq_users_account_name_tag',
        'users',
        ['account_name', 'account_tag']
    )

    # Add index for efficient case-insensitive lookups on account_name
    # Using functional index on lower(account_name)
    op.create_index(
        'idx_users_account_name_lower',
        'users',
        [sa.text('LOWER(account_name)')],
        unique=False
    )


def downgrade() -> None:
    op.drop_index('idx_users_account_name_lower', table_name='users')
    op.drop_constraint('uq_users_account_name_tag', 'users', type_='unique')
    op.drop_column('users', 'account_tag')
    op.drop_column('users', 'account_name')
