"""drop grid margin columns from map assets

Revision ID: 7fed31949a00
Revises: c568ca6b6711
Create Date: 2026-03-19 19:41:34.098892

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7fed31949a00'
down_revision = 'c568ca6b6711'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column('map_assets', 'grid_margin_x')
    op.drop_column('map_assets', 'grid_margin_y')


def downgrade() -> None:
    op.add_column('map_assets', sa.Column('grid_margin_y', sa.INTEGER(), autoincrement=False, nullable=True))
    op.add_column('map_assets', sa.Column('grid_margin_x', sa.INTEGER(), autoincrement=False, nullable=True))