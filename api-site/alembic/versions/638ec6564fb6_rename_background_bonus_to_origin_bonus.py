"""rename background_bonus to origin_bonus

Revision ID: 638ec6564fb6
Revises: 75c40a22ba56
Create Date: 2026-03-10 14:30:04.947347

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = '638ec6564fb6'
down_revision = '75c40a22ba56'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('character_ability_scores', 'background_bonus', new_column_name='origin_bonus')


def downgrade() -> None:
    op.alter_column('character_ability_scores', 'origin_bonus', new_column_name='background_bonus')
