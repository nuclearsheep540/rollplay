"""wipe_draft_characters_for_origin_bonus_fix

Revision ID: a07d98ebfd68
Revises: 5641645029ef
Create Date: 2026-05-27 07:33:45.334840

Data-only migration. Existing drafts had background ability bonuses baked
straight into character_ability_scores.score (with origin_bonus = 0), so they
display wrong values once the aggregate starts honouring origin_bonus as a
separate field. Wipe any in-progress drafts so users start the wizard fresh.

Finalized characters are untouched — their bonuses remain baked in, but the
new aggregate treats origin_bonus = 0 as "no recorded bonus" which is a
cosmetic difference only (no functional regression for runtime math).
"""
from alembic import op
import sqlalchemy as sa


revision = 'a07d98ebfd68'
down_revision = '5641645029ef'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    # FK cascades on character_id handle the join tables (class_entries,
    # ability_scores, save_proficiencies, skill_proficiencies, feat_acquisitions,
    # choices_log). Drafts are never locked to campaigns, so no campaign FK to
    # worry about.
    conn.execute(sa.text("DELETE FROM characters WHERE is_draft = true"))


def downgrade() -> None:
    # Data-only migration — can't restore deleted drafts.
    pass