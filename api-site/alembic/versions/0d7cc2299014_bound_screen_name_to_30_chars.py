"""bound screen_name to 30 chars

Revision ID: 0d7cc2299014
Revises: e58664838aae
Create Date: 2026-08-30 14:43:24.399377

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0d7cc2299014'
down_revision = 'e58664838aae'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Written by hand: autogenerate does not flag VARCHAR -> VARCHAR(30), even
    # with compare_type enabled, so it produced an empty revision. Matches the
    # limit UserAggregate.update_screen_name has always enforced. Safe to
    # narrow — the longest existing screen_name is 19 characters.
    op.alter_column(
        'users',
        'screen_name',
        existing_type=sa.VARCHAR(),
        type_=sa.String(length=30),
        existing_nullable=False,
        existing_server_default=sa.text("''::character varying"),
    )


def downgrade() -> None:
    op.alter_column(
        'users',
        'screen_name',
        existing_type=sa.String(length=30),
        type_=sa.VARCHAR(),
        existing_nullable=False,
        existing_server_default=sa.text("''::character varying"),
    )