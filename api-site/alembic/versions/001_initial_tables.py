"""Initial tables for rollplay database

Revision ID: 001
Revises: 
Create Date: 2025-01-14

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create users table
    op.create_table('users',
    sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column('email', sa.String(), nullable=False),
    sa.Column('screen_name', sa.String(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.Column('last_login', sa.DateTime(), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('email'),
    sa.UniqueConstraint('screen_name')
    )
    
    # Create games table
    op.create_table('games',
    sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column('name', sa.String(), nullable=False),
    sa.Column('dm_id', postgresql.UUID(as_uuid=True), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.Column('status', sa.String(), nullable=True),
    sa.Column('max_players', sa.Integer(), nullable=True),
    sa.Column('description', sa.Text(), nullable=True),
    sa.ForeignKeyConstraint(['dm_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    
    # Create characters table
    op.create_table('characters',
    sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=True),
    sa.Column('name', sa.String(), nullable=False),
    sa.Column('character_class', sa.String(), nullable=True),
    sa.Column('level', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.Column('is_deleted', sa.Boolean(), nullable=True),
    sa.Column('stats', sa.JSON(), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    
    # Create game_players table
    op.create_table('game_players',
    sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column('game_id', postgresql.UUID(as_uuid=True), nullable=True),
    sa.Column('character_id', postgresql.UUID(as_uuid=True), nullable=True),
    sa.Column('joined_at', sa.DateTime(), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=True),
    sa.ForeignKeyConstraint(['character_id'], ['characters.id'], ),
    sa.ForeignKeyConstraint(['game_id'], ['games.id'], ),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('game_players')
    op.drop_table('characters')
    op.drop_table('games')
    op.drop_table('users')