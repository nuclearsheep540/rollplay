"""game_joined_users_and_character_locks

Revision ID: a69fcd0b2b6b
Revises: 585b24e975ea
Create Date: 2025-10-30 13:10:47.631719

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'a69fcd0b2b6b'
down_revision = '585b24e975ea'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create game_joined_users table
    op.create_table('game_joined_users',
        sa.Column('game_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('joined_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('selected_character_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(['game_id'], ['games.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['selected_character_id'], ['characters.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('game_id', 'user_id')
    )

    # Create indexes for performance
    op.create_index('idx_game_joined_users_game_id', 'game_joined_users', ['game_id'])
    op.create_index('idx_game_joined_users_user_id', 'game_joined_users', ['user_id'])

    # 2. Add character locking columns to characters table
    op.add_column('characters', sa.Column('active_in_game_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('characters', sa.Column('is_alive', sa.Boolean(), nullable=False, server_default='true'))

    # Add foreign key constraint for active_in_game_id
    op.create_foreign_key('fk_characters_active_game', 'characters', 'games', ['active_in_game_id'], ['id'], ondelete='SET NULL')

    # Create index for character locking queries
    op.create_index('idx_characters_active_game', 'characters', ['active_in_game_id'])

    # 3. Drop game_characters table if it exists (replaced by game_joined_users.selected_character_id)
    op.execute("DROP TABLE IF EXISTS game_characters CASCADE")


def downgrade() -> None:
    # Reverse the changes

    # 1. Recreate game_characters table (if needed for rollback)
    op.create_table('game_characters',
        sa.Column('game_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('character_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('joined_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['game_id'], ['games.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['character_id'], ['characters.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('game_id', 'character_id')
    )

    # 2. Remove character locking columns from characters table
    op.drop_index('idx_characters_active_game', 'characters')
    op.drop_constraint('fk_characters_active_game', 'characters', type_='foreignkey')
    op.drop_column('characters', 'is_alive')
    op.drop_column('characters', 'active_in_game_id')

    # 3. Drop game_joined_users table
    op.drop_index('idx_game_joined_users_user_id', 'game_joined_users')
    op.drop_index('idx_game_joined_users_game_id', 'game_joined_users')
    op.drop_table('game_joined_users')