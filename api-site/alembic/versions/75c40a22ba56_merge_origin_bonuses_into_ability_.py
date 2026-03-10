"""merge origin bonuses into ability scores table

Revision ID: 75c40a22ba56
Revises: c56ee1499677
Create Date: 2026-03-10 14:27:37.368034

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '75c40a22ba56'
down_revision = 'c56ee1499677'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add background_bonus column to ability scores table
    op.add_column('character_ability_scores', sa.Column('background_bonus', sa.Integer(), server_default='0', nullable=False))

    # 2. Migrate data from origin bonuses table into the new column
    conn = op.get_bind()
    conn.execute(sa.text(
        "UPDATE character_ability_scores cas "
        "SET background_bonus = cob.bonus "
        "FROM character_origin_bonuses cob "
        "WHERE cas.character_id = cob.character_id "
        "AND cas.ability_id = cob.ability_id"
    ))

    # 3. Drop the now-redundant origin bonuses table
    op.drop_table('character_origin_bonuses')


def downgrade() -> None:
    # 1. Re-create origin bonuses table
    op.create_table('character_origin_bonuses',
    sa.Column('character_id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('ability_id', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('bonus', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.ForeignKeyConstraint(['ability_id'], ['dnd_abilities.id'], name='character_origin_bonuses_ability_id_fkey'),
    sa.ForeignKeyConstraint(['character_id'], ['characters.id'], name='character_origin_bonuses_character_id_fkey', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('character_id', 'ability_id', name='character_origin_bonuses_pkey')
    )

    # 2. Migrate non-zero bonuses back to separate table
    conn = op.get_bind()
    conn.execute(sa.text(
        "INSERT INTO character_origin_bonuses (character_id, ability_id, bonus) "
        "SELECT character_id, ability_id, background_bonus "
        "FROM character_ability_scores "
        "WHERE background_bonus > 0"
    ))

    # 3. Drop the column
    op.drop_column('character_ability_scores', 'background_bonus')
