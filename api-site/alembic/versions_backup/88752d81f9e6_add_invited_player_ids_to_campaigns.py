"""add_invited_player_ids_to_campaigns

Revision ID: 88752d81f9e6
Revises: 7b0368fed808
Create Date: 2025-11-17 17:06:43.974420

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = '88752d81f9e6'
down_revision = '7b0368fed808'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add invited_player_ids column to campaigns table
    op.add_column('campaigns',
        sa.Column('invited_player_ids',
                  postgresql.JSONB(astext_type=sa.Text()),
                  nullable=False,
                  server_default=sa.text("'[]'::jsonb"))
    )


def downgrade() -> None:
    # Remove invited_player_ids column from campaigns table
    op.drop_column('campaigns', 'invited_player_ids')