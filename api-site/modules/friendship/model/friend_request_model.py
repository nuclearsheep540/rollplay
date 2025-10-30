# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, DateTime, CheckConstraint, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from shared.dependencies.db import Base


class FriendRequestModel(Base):
    """
    Friend Request ORM Model

    Represents a directional friend request from requester to recipient.
    """
    __tablename__ = "friend_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    requester_id = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    recipient_id = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    # Relationships
    requester = relationship("User", foreign_keys=[requester_id])
    recipient = relationship("User", foreign_keys=[recipient_id])

    # Constraints
    __table_args__ = (
        UniqueConstraint('requester_id', 'recipient_id', name='uq_friend_requests_requester_recipient'),
        CheckConstraint('requester_id != recipient_id', name='no_self_request'),
    )

    def __repr__(self):
        return f"<FriendRequestModel(id={self.id}, requester_id={self.requester_id}, recipient_id={self.recipient_id})>"
