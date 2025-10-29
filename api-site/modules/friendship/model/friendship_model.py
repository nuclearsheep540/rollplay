# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, String, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from shared.dependencies.db import Base


class Friendship(Base):
    __tablename__ = 'friendships'

    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), primary_key=True, nullable=False)
    friend_id = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), primary_key=True, nullable=False)
    status = Column(String(20), default='pending', nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint('user_id != friend_id', name='no_self_friendship'),
    )

    def __repr__(self):
        return f"<Friendship(user_id={self.user_id}, friend_id={self.friend_id}, status='{self.status}')>"
