"""add notifications table

Revision ID: a1b2c3d4e5f6
Revises: 15637668dd0b
Create Date: 2026-01-04 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = 'a1b2c3d4e5f6'
down_revision = '15637668dd0b'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'notifications',
        sa.Column('id', postgresql.UUID(), nullable=False),
        sa.Column('user_id', postgresql.UUID(), nullable=False),
        sa.Column('event_type', sa.String(100), nullable=False),
        sa.Column('data', postgresql.JSONB(), nullable=False),
        sa.Column('read', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_index('idx_notifications_user_id', 'notifications', ['user_id'])
    op.create_index('idx_notifications_unread', 'notifications', ['user_id', 'read', 'created_at'])
    op.create_index('idx_notifications_created', 'notifications', ['created_at'])


def downgrade() -> None:
    op.drop_index('idx_notifications_created', table_name='notifications')
    op.drop_index('idx_notifications_unread', table_name='notifications')
    op.drop_index('idx_notifications_user_id', table_name='notifications')
    op.drop_table('notifications')
