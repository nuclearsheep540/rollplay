"""screen_name NOT NULL with empty default

Revision ID: ce2ec30211b3
Revises: 9bd9515a2d0e
Create Date: 2026-07-08 14:15:42.473681

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'ce2ec30211b3'
down_revision = '9bd9515a2d0e'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Belt-and-braces: any legacy row with no name (created pre-modal) gets '' so the NOT NULL
    # alter can't fail and block startup. '' = "unset" — the FE name modal will prompt them.
    op.execute("UPDATE users SET screen_name = '' WHERE screen_name IS NULL")
    op.alter_column('users', 'screen_name',
               existing_type=sa.VARCHAR(),
               nullable=False,
               server_default='')


def downgrade() -> None:
    op.alter_column('users', 'screen_name',
               existing_type=sa.VARCHAR(),
               nullable=True,
               server_default=None)