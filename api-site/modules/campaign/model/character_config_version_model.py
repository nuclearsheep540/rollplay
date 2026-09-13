# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func
import uuid

from shared.dependencies.db import Base


class CharacterConfigVersion(Base):
    """One immutable published version of a campaign's character config.

    ``config`` is the whole validated shared_contracts CharacterConfig document, stored as
    one JSON value and never reassembled from rows. Rows are inserted by
    PublishCharacterConfigVersion and never updated: a character that was built against a
    version keeps rendering from it forever.

    Cascade-deleted with the campaign. Characters embed their own snapshot, so nothing here
    is needed to render one — which is what makes keepsakes free.
    """

    __tablename__ = 'character_config_versions'
    __table_args__ = (
        UniqueConstraint('campaign_id', 'version', name='uq_character_config_versions_campaign_version'),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey('campaigns.id', ondelete='CASCADE'), nullable=False, index=True)
    version = Column(Integer, nullable=False)
    config = Column(JSONB, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def __repr__(self):
        return f"<CharacterConfigVersion(campaign_id={self.campaign_id}, version={self.version})>"
