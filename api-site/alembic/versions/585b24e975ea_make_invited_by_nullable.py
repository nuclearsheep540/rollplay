"""make_invited_by_nullable

Revision ID: 585b24e975ea
Revises: 004_split_friendships
Create Date: 2025-10-29 19:49:41.398568

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '585b24e975ea'
down_revision = '004_split_friendships'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Make invited_by column nullable in game_invites table
    op.alter_column('game_invites', 'invited_by',
                    existing_type=sa.UUID(),
                    nullable=True)


def downgrade() -> None:
    # Revert invited_by column back to NOT NULL
    op.alter_column('game_invites', 'invited_by',
                    existing_type=sa.UUID(),
                    nullable=False)