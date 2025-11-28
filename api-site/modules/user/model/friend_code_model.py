# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from shared.dependencies.db import Base


class FriendCode(Base):
    """
    Friend Code ORM Model

    Maps users to human-readable friend codes for easy friend discovery.
    Format: predicate-object (e.g., "happy-elephant", "brave-lion")
    """
    __tablename__ = "friend_codes"

    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    friend_code = Column(String(50), unique=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<FriendCode(user_id={self.user_id}, code={self.friend_code})>"
