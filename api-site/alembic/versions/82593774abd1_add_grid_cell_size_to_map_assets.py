"""Add grid_cell_size to map_assets

Revision ID: 82593774abd1
Revises: 7fed31949a00
Create Date: 2026-03-20 09:33:24.956593

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '82593774abd1'
down_revision = '7fed31949a00'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('map_assets', sa.Column('grid_cell_size', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('map_assets', 'grid_cell_size')