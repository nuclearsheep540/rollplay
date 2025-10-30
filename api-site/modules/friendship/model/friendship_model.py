# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, DateTime, ForeignKey, CheckConstraint, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from shared.dependencies.db import Base


class FriendshipModel(Base):
    """
    Friendship ORM Model

    Represents an accepted (mutual) friendship between two users.
    Uses canonical ordering (user1_id < user2_id) to prevent duplicates.
    """
    __tablename__ = 'friendships'

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    user1_id = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    user2_id = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    user1 = relationship("User", foreign_keys=[user1_id])
    user2 = relationship("User", foreign_keys=[user2_id])

    # Constraints
    __table_args__ = (
        UniqueConstraint('user1_id', 'user2_id', name='uq_friendships_user1_user2'),
        CheckConstraint('user1_id != user2_id', name='no_self_friendship_new'),
        CheckConstraint('user1_id < user2_id', name='ordered_friendship'),  # Canonical ordering
    )

    def __repr__(self):
        return f"<FriendshipModel(id={self.id}, user1_id={self.user1_id}, user2_id={self.user2_id})>"
