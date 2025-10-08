"""merge migration heads

Revision ID: 8b90c761456a
Revises: 003_add_player_ids_to_campaigns, 88e81d91af72
Create Date: 2025-09-24 12:43:50.062237

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '8b90c761456a'
down_revision = ('003_add_player_ids_to_campaigns', '88e81d91af72')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass