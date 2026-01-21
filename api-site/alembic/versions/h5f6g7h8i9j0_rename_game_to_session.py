# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""rename_game_to_session

Ubiquitous Language Alignment:
- "Session" = The scheduled/planned entity (PostgreSQL) - create, start, pause, finish
- "Game" = The live experience (MongoDB) - enter, play, roll dice

This migration renames:
- games table → sessions
- game_joined_users table → session_joined_users
- game_id column → session_id
- active_in_game_id column → active_in_session_id

Revision ID: h5f6g7h8i9j0
Revises: g4e5f6a7b8c9
Create Date: 2026-01-21 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'h5f6g7h8i9j0'
down_revision = 'g4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Step 1: Rename the association table first (has FK to games)
    # Note: This also renames the primary key constraint automatically
    op.rename_table('game_joined_users', 'session_joined_users')

    # Step 2: Rename the main games table
    op.rename_table('games', 'sessions')

    # Step 3: Rename columns
    # Rename game_id to session_id in the association table
    op.alter_column(
        'session_joined_users',
        'game_id',
        new_column_name='session_id'
    )

    # Rename active_in_game_id to active_in_session_id in characters table
    op.alter_column(
        'characters',
        'active_in_game_id',
        new_column_name='active_in_session_id'
    )

    # Rename session_id to active_game_id in sessions table
    # (This column stores the MongoDB ObjectID when game is running)
    op.alter_column(
        'sessions',
        'session_id',
        new_column_name='active_game_id'
    )


def downgrade() -> None:
    # Step 1: Rename columns back
    op.alter_column(
        'sessions',
        'active_game_id',
        new_column_name='session_id'
    )

    op.alter_column(
        'characters',
        'active_in_session_id',
        new_column_name='active_in_game_id'
    )

    op.alter_column(
        'session_joined_users',
        'session_id',
        new_column_name='game_id'
    )

    # Step 2: Rename tables back
    op.rename_table('sessions', 'games')
    op.rename_table('session_joined_users', 'game_joined_users')
