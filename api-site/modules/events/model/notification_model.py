# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, String, DateTime, Boolean, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from datetime import datetime
from uuid import uuid4
from shared.dependencies.db import Base


class Notification(Base):
    """
    SQLAlchemy ORM model for notifications table.

    Stores persisted event notifications for users.
    Used for notification history and offline notification delivery.
    """
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    event_type = Column(String(100), nullable=False)
    data = Column(JSONB, nullable=False)
    read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index('idx_notifications_user_id', 'user_id'),
        Index('idx_notifications_unread', 'user_id', 'read', 'created_at'),
        Index('idx_notifications_created', 'created_at'),
    )

    def __repr__(self):
        return f"<Notification {self.event_type} for user {self.user_id}>"
