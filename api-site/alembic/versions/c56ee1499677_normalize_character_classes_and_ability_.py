"""normalize character classes and ability scores

Revision ID: c56ee1499677
Revises: 0cab2701cd5b
Create Date: 2026-03-10 14:06:12.435588

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'c56ee1499677'
down_revision = '0cab2701cd5b'
branch_labels = None
depends_on = None

# Seed data
DND_CLASSES = ['Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk',
               'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard']

DND_ABILITIES = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']


def upgrade() -> None:
    # 1. Create lookup tables
    op.create_table('dnd_abilities',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('name', sa.String(length=20), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('name')
    )
    op.create_table('dnd_classes',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('name', sa.String(length=20), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('name')
    )

    # 2. Seed lookup tables
    conn = op.get_bind()
    for name in DND_CLASSES:
        conn.execute(sa.text("INSERT INTO dnd_classes (name) VALUES (:name)"), {"name": name})
    for name in DND_ABILITIES:
        conn.execute(sa.text("INSERT INTO dnd_abilities (name) VALUES (:name)"), {"name": name})

    # Build lookup maps for data migration
    class_rows = conn.execute(sa.text("SELECT id, name FROM dnd_classes")).fetchall()
    class_map = {row[1]: row[0] for row in class_rows}

    ability_rows = conn.execute(sa.text("SELECT id, name FROM dnd_abilities")).fetchall()
    ability_map = {row[1]: row[0] for row in ability_rows}

    # 3. Create join tables
    op.create_table('character_ability_scores',
    sa.Column('character_id', sa.UUID(), nullable=False),
    sa.Column('ability_id', sa.Integer(), nullable=False),
    sa.Column('score', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['ability_id'], ['dnd_abilities.id'], ),
    sa.ForeignKeyConstraint(['character_id'], ['characters.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('character_id', 'ability_id')
    )
    op.create_table('character_classes',
    sa.Column('character_id', sa.UUID(), nullable=False),
    sa.Column('class_id', sa.Integer(), nullable=False),
    sa.Column('level', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['character_id'], ['characters.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['class_id'], ['dnd_classes.id'], ),
    sa.PrimaryKeyConstraint('character_id', 'class_id')
    )
    op.create_table('character_origin_bonuses',
    sa.Column('character_id', sa.UUID(), nullable=False),
    sa.Column('ability_id', sa.Integer(), nullable=False),
    sa.Column('bonus', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['ability_id'], ['dnd_abilities.id'], ),
    sa.ForeignKeyConstraint(['character_id'], ['characters.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('character_id', 'ability_id')
    )

    # 4. Migrate data from JSONB columns to join tables
    characters = conn.execute(
        sa.text("SELECT id, character_classes, stats, origin_ability_bonuses FROM characters")
    ).fetchall()

    for char in characters:
        char_id = char[0]
        classes_json = char[1] or []
        stats_json = char[2] or {}
        bonuses_json = char[3] or {}

        # Migrate character_classes: [{"class": "Fighter", "level": 5}, ...]
        for class_data in classes_json:
            class_name = class_data.get('class')
            level = class_data.get('level', 1)
            if class_name and class_name in class_map:
                conn.execute(
                    sa.text(
                        "INSERT INTO character_classes (character_id, class_id, level) "
                        "VALUES (:char_id, :class_id, :level) "
                        "ON CONFLICT (character_id, class_id) DO NOTHING"
                    ),
                    {"char_id": str(char_id), "class_id": class_map[class_name], "level": level}
                )

        # Migrate stats: {"strength": 10, "dexterity": 14, ...}
        for ability_name, score in stats_json.items():
            if ability_name in ability_map:
                conn.execute(
                    sa.text(
                        "INSERT INTO character_ability_scores (character_id, ability_id, score) "
                        "VALUES (:char_id, :ability_id, :score) "
                        "ON CONFLICT (character_id, ability_id) DO NOTHING"
                    ),
                    {"char_id": str(char_id), "ability_id": ability_map[ability_name], "score": score}
                )

        # Migrate origin_ability_bonuses: {"strength": 2, "dexterity": 1}
        for ability_name, bonus in bonuses_json.items():
            if ability_name in ability_map and bonus > 0:
                conn.execute(
                    sa.text(
                        "INSERT INTO character_origin_bonuses (character_id, ability_id, bonus) "
                        "VALUES (:char_id, :ability_id, :bonus) "
                        "ON CONFLICT (character_id, ability_id) DO NOTHING"
                    ),
                    {"char_id": str(char_id), "ability_id": ability_map[ability_name], "bonus": bonus}
                )

    # 5. Drop old JSONB columns
    op.drop_column('characters', 'stats')
    op.drop_column('characters', 'origin_ability_bonuses')
    op.drop_column('characters', 'character_classes')


def downgrade() -> None:
    # 1. Re-add JSONB columns
    op.add_column('characters', sa.Column('character_classes', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), autoincrement=False, nullable=False))
    op.add_column('characters', sa.Column('origin_ability_bonuses', postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=True))
    op.add_column('characters', sa.Column('stats', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), autoincrement=False, nullable=False))

    # 2. Migrate data back from join tables to JSONB
    conn = op.get_bind()

    # Build reverse lookup maps
    class_rows = conn.execute(sa.text("SELECT id, name FROM dnd_classes")).fetchall()
    class_map = {row[0]: row[1] for row in class_rows}

    ability_rows = conn.execute(sa.text("SELECT id, name FROM dnd_abilities")).fetchall()
    ability_map = {row[0]: row[1] for row in ability_rows}

    # Restore character_classes JSONB
    class_entries = conn.execute(
        sa.text("SELECT character_id, class_id, level FROM character_classes")
    ).fetchall()
    # Group by character_id
    char_classes = {}
    for entry in class_entries:
        char_id = str(entry[0])
        if char_id not in char_classes:
            char_classes[char_id] = []
        char_classes[char_id].append({"class": class_map[entry[1]], "level": entry[2]})

    for char_id, classes in char_classes.items():
        import json
        conn.execute(
            sa.text("UPDATE characters SET character_classes = :classes::jsonb WHERE id = :char_id"),
            {"classes": json.dumps(classes), "char_id": char_id}
        )

    # Restore stats JSONB
    score_entries = conn.execute(
        sa.text("SELECT character_id, ability_id, score FROM character_ability_scores")
    ).fetchall()
    char_stats = {}
    for entry in score_entries:
        char_id = str(entry[0])
        if char_id not in char_stats:
            char_stats[char_id] = {}
        char_stats[char_id][ability_map[entry[1]]] = entry[2]

    for char_id, stats in char_stats.items():
        import json
        conn.execute(
            sa.text("UPDATE characters SET stats = :stats::jsonb WHERE id = :char_id"),
            {"stats": json.dumps(stats), "char_id": char_id}
        )

    # Restore origin_ability_bonuses JSONB
    bonus_entries = conn.execute(
        sa.text("SELECT character_id, ability_id, bonus FROM character_origin_bonuses")
    ).fetchall()
    char_bonuses = {}
    for entry in bonus_entries:
        char_id = str(entry[0])
        if char_id not in char_bonuses:
            char_bonuses[char_id] = {}
        char_bonuses[char_id][ability_map[entry[1]]] = entry[2]

    for char_id, bonuses in char_bonuses.items():
        import json
        conn.execute(
            sa.text("UPDATE characters SET origin_ability_bonuses = :bonuses::jsonb WHERE id = :char_id"),
            {"bonuses": json.dumps(bonuses), "char_id": char_id}
        )

    # 3. Drop join tables and lookup tables
    op.drop_table('character_origin_bonuses')
    op.drop_table('character_classes')
    op.drop_table('character_ability_scores')
    op.drop_table('dnd_classes')
    op.drop_table('dnd_abilities')
