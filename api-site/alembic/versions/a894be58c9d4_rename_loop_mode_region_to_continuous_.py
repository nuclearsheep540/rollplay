"""rename loop_mode region to continuous for legacy data

Revision ID: a894be58c9d4
Revises: 46984f2337ed
Create Date: 2026-04-20 20:58:38.734432

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a894be58c9d4'
down_revision = '46984f2337ed'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Historically `loop_mode = 'region'` meant "play from 0, loop between loop
    # points" — which is now the `continuous` mode. `region` now carries the
    # stricter semantic of "stay inside the loop region". Rename legacy rows
    # so existing user configurations keep behaving as they did.
    op.execute("UPDATE music_assets SET loop_mode = 'continuous' WHERE loop_mode = 'region'")


def downgrade() -> None:
    # Best-effort reverse: rename continuous back to region. Note this loses
    # the distinction between "continuous" and the new strict "region" — any
    # rows written as strict-region after the upgrade collapse into the same
    # bucket on downgrade, which matches the pre-refactor single meaning.
    op.execute("UPDATE music_assets SET loop_mode = 'region' WHERE loop_mode = 'continuous'")