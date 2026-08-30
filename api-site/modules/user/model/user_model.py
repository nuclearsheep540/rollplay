# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import CheckConstraint, Column, String, DateTime, Boolean, Integer, Index, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
from uuid import uuid4
from shared.dependencies.db import Base

class User(Base):
    """
    SQLAlchemy ORM model for users table.

    This is the data layer representation - keep separate from domain logic.
    Use UserMapper to convert between this and UserAggregate.
    """
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    screen_name = Column(String(30), nullable=False, server_default='')  # NOT NULL; '' = unset (FE name modal prompts on empty). 30 = the aggregate's validation limit.
    account_name = Column(String(30), nullable=True)  # Immutable username for friend lookups
    account_tag = Column(String(4), nullable=True)  # 4-digit discriminator (e.g., "2345")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_login = Column(DateTime, nullable=True)
    is_deleted = Column(Boolean, default=False, nullable=False)  # Soft delete flag
    deleted_at = Column(DateTime, nullable=True)  # When soft deleted
    # Identity color (hex from the curated USER_COLORS palette). Paints the
    # account icon and this user's disc in other users' social panes. NULL =
    # not chosen (display falls back to a deterministic hash client-side).
    # Distinct from characters.color (in-game persona color).
    color = Column(String(7), nullable=True)
    # Character capacity knob (slots on the characters table). Per-user raises
    # are plain UPDATEs; the CHECK below is the hard ceiling nothing may pass.
    max_slots = Column(Integer, nullable=False, server_default='4')

    # Relationships (for ORM convenience, not exposed to domain)
    campaigns = relationship("Campaign", back_populates="creator")
    sessions = relationship("Session", back_populates="host")  # Renamed from "games"

    # Table constraints - sync model with existing DB constraints
    __table_args__ = (
        Index('idx_users_account_name_lower', func.lower(account_name)),
        UniqueConstraint('account_name', 'account_tag', name='uq_users_account_name_tag'),
        CheckConstraint('max_slots >= 1 AND max_slots <= 8', name='ck_users_max_slots_range'),
    )

    def __repr__(self):
        return "<User {}>".format(self.email)