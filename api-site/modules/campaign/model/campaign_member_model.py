# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from shared.dependencies.db import Base


class CampaignMember(Base):
    """
    Association table for campaign membership.

    Tracks both pending invites (role='invited') and accepted players (role='player').
    Invite acceptance = UPDATE role from 'invited' to 'player'.

    FK CASCADE on both campaign_id and user_id ensures automatic cleanup
    when either a campaign or user is deleted.
    """
    __tablename__ = 'campaign_members'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey('campaigns.id', ondelete='CASCADE'), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    role = Column(String(10), nullable=False)  # 'player' or 'invited'
    joined_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint('campaign_id', 'user_id', name='uq_campaign_member'),
    )

    # Relationships
    campaign = relationship("Campaign", back_populates="members")
    user = relationship("User")

    def __repr__(self):
        return f"<CampaignMember(campaign_id={self.campaign_id}, user_id={self.user_id}, role='{self.role}')>"
