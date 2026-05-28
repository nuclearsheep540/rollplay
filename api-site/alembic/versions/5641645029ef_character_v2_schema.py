"""character_v2_schema

Revision ID: 5641645029ef
Revises: 0bd65054c91c
Create Date: 2026-05-26 17:44:16.942155

Destructive migration that rebuilds the character schema for the v2 design:
- Wipes every existing character (per .claude/plans/character-v2.md).
- Drops the dnd_classes lookup table; class metadata now lives in JSON.
- Adds an ``editions`` lookup, seeds the default D&D 2024 row.
- Backfills the existing campaigns to that edition before forcing NOT NULL.
- Recreates ``characters`` with the v2 column set and adds five new join
  tables (class entries, save profs, skill profs, feat acquisitions, choice log).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = '5641645029ef'
down_revision = '0bd65054c91c'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Wipe character data so NOT NULL column adds don't blow up on existing
    #    rows. Order matters: child join tables first.
    conn.execute(sa.text("DELETE FROM character_ability_scores"))
    conn.execute(sa.text("DELETE FROM character_classes"))
    conn.execute(sa.text("DELETE FROM characters"))

    # 2. Drop the old class lookup (dnd_classes) and its join (character_classes).
    op.drop_table('character_classes')
    op.drop_table('dnd_classes')

    # 3. Create the editions lookup + seed the default D&D 2024 row.
    op.create_table(
        'editions',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('code', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('version', sa.String(length=20), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code'),
    )
    conn.execute(sa.text(
        "INSERT INTO editions (code, name, version, is_active) "
        "VALUES ('srd_5_2_1', 'D&D 2024 (5.5e)', '5.2.1', true)"
    ))
    default_edition_id = conn.execute(
        sa.text("SELECT id FROM editions WHERE code = 'srd_5_2_1'")
    ).scalar_one()

    # 4. campaigns.edition_id — add nullable, backfill, then force NOT NULL.
    op.add_column('campaigns', sa.Column('edition_id', sa.Integer(), nullable=True))
    conn.execute(
        sa.text("UPDATE campaigns SET edition_id = :eid"),
        {"eid": default_edition_id},
    )
    op.alter_column('campaigns', 'edition_id', nullable=False)
    op.create_foreign_key(
        'fk_campaigns_edition_id',
        'campaigns', 'editions',
        ['edition_id'], ['id'],
    )

    # 5. characters — add the v2 columns. characters table is empty (step 1) so
    #    NOT NULL columns without server defaults are safe.
    op.add_column('characters', sa.Column('edition_id', sa.Integer(), nullable=False))
    op.add_column('characters', sa.Column('species_code', sa.String(length=50), nullable=False))
    op.add_column('characters', sa.Column('background_code', sa.String(length=50), nullable=False))
    op.add_column('characters', sa.Column('xp', sa.Integer(), server_default='0', nullable=False))
    op.add_column('characters', sa.Column('hp_temp', sa.Integer(), server_default='0', nullable=False))
    op.add_column('characters', sa.Column('death_save_successes', sa.SmallInteger(), server_default='0', nullable=False))
    op.add_column('characters', sa.Column('death_save_failures', sa.SmallInteger(), server_default='0', nullable=False))
    op.add_column('characters', sa.Column('inspiration', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('characters', sa.Column('status_effects', postgresql.ARRAY(sa.String()), server_default='{}', nullable=False))
    op.add_column('characters', sa.Column('speed', sa.Integer(), nullable=False))
    op.add_column('characters', sa.Column('size', sa.String(length=10), nullable=False))
    op.add_column('characters', sa.Column('languages', postgresql.ARRAY(sa.String()), server_default='{}', nullable=False))
    op.add_column('characters', sa.Column('is_draft', sa.Boolean(), server_default='true', nullable=False))
    op.add_column('characters', sa.Column('creation_step', sa.String(length=30), nullable=True))
    op.create_foreign_key(
        'fk_characters_edition_id',
        'characters', 'editions',
        ['edition_id'], ['id'],
    )
    op.drop_column('characters', 'character_race')
    op.drop_column('characters', 'background')

    # 6. New v2 join tables.
    op.create_table(
        'character_class_entries',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('character_id', sa.UUID(), nullable=False),
        sa.Column('class_code', sa.String(length=50), nullable=False),
        sa.Column('level', sa.Integer(), nullable=False),
        sa.Column('is_primary', sa.Boolean(), server_default='false', nullable=False),
        sa.ForeignKeyConstraint(['character_id'], ['characters.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('character_id', 'class_code', name='uq_character_class'),
    )
    op.create_table(
        'character_save_proficiencies',
        sa.Column('character_id', sa.UUID(), nullable=False),
        sa.Column('ability_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['ability_id'], ['dnd_abilities.id']),
        sa.ForeignKeyConstraint(['character_id'], ['characters.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('character_id', 'ability_id'),
    )
    op.create_table(
        'character_skill_proficiencies',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('character_id', sa.UUID(), nullable=False),
        sa.Column('skill_code', sa.String(length=50), nullable=False),
        sa.Column('source', sa.String(length=20), nullable=False),
        sa.Column('expertise', sa.Boolean(), server_default='false', nullable=False),
        sa.ForeignKeyConstraint(['character_id'], ['characters.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('character_id', 'skill_code', name='uq_character_skill'),
    )
    op.create_table(
        'character_feat_acquisitions',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('character_id', sa.UUID(), nullable=False),
        sa.Column('feat_code', sa.String(length=50), nullable=False),
        sa.Column('acquired_at_level', sa.Integer(), nullable=False),
        sa.Column('source', sa.String(length=20), nullable=False),
        sa.ForeignKeyConstraint(['character_id'], ['characters.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('character_id', 'feat_code', 'acquired_at_level', name='uq_character_feat_level'),
    )
    op.create_table(
        'character_choices_log',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('character_id', sa.UUID(), nullable=False),
        sa.Column('level', sa.Integer(), nullable=False),
        sa.Column('choice_type', sa.String(length=30), nullable=False),
        sa.Column('choice_data', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['character_id'], ['characters.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('character_choices_log')
    op.drop_table('character_feat_acquisitions')
    op.drop_table('character_skill_proficiencies')
    op.drop_table('character_save_proficiencies')
    op.drop_table('character_class_entries')

    op.add_column(
        'characters',
        sa.Column('background', sa.VARCHAR(length=50), autoincrement=False, nullable=True),
    )
    op.add_column(
        'characters',
        sa.Column('character_race', sa.VARCHAR(length=50), autoincrement=False, nullable=False),
    )
    op.drop_constraint('fk_characters_edition_id', 'characters', type_='foreignkey')
    op.drop_column('characters', 'creation_step')
    op.drop_column('characters', 'is_draft')
    op.drop_column('characters', 'languages')
    op.drop_column('characters', 'size')
    op.drop_column('characters', 'speed')
    op.drop_column('characters', 'status_effects')
    op.drop_column('characters', 'inspiration')
    op.drop_column('characters', 'death_save_failures')
    op.drop_column('characters', 'death_save_successes')
    op.drop_column('characters', 'hp_temp')
    op.drop_column('characters', 'xp')
    op.drop_column('characters', 'background_code')
    op.drop_column('characters', 'species_code')
    op.drop_column('characters', 'edition_id')
    op.drop_constraint('fk_campaigns_edition_id', 'campaigns', type_='foreignkey')
    op.drop_column('campaigns', 'edition_id')

    op.drop_table('editions')

    op.create_table(
        'dnd_classes',
        sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
        sa.Column('name', sa.VARCHAR(length=20), autoincrement=False, nullable=False),
        sa.PrimaryKeyConstraint('id', name='dnd_classes_pkey'),
        sa.UniqueConstraint('name', name='dnd_classes_name_key'),
    )
    op.create_table(
        'character_classes',
        sa.Column('character_id', sa.UUID(), autoincrement=False, nullable=False),
        sa.Column('class_id', sa.INTEGER(), autoincrement=False, nullable=False),
        sa.Column('level', sa.INTEGER(), autoincrement=False, nullable=False),
        sa.ForeignKeyConstraint(
            ['character_id'], ['characters.id'],
            name='character_classes_character_id_fkey', ondelete='CASCADE',
        ),
        sa.ForeignKeyConstraint(
            ['class_id'], ['dnd_classes.id'], name='character_classes_class_id_fkey',
        ),
        sa.PrimaryKeyConstraint('character_id', 'class_id', name='character_classes_pkey'),
    )
