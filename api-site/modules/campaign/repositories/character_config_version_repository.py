# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from modules.campaign.domain.character_config_version import CharacterConfigVersionRecord
from modules.campaign.model.character_config_version_model import CharacterConfigVersion
from shared_contracts.character_config import CharacterConfig


class CharacterConfigVersionRepository:
    """Published character config versions. Insert and read only — rows are never updated."""

    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, version_id: UUID) -> Optional[CharacterConfigVersionRecord]:
        model = self.db.query(CharacterConfigVersion).filter_by(id=version_id).first()
        return CharacterConfigVersionRecord.from_persistence(model) if model else None

    def get_latest(self, campaign_id: UUID) -> Optional[CharacterConfigVersionRecord]:
        model = (
            self.db.query(CharacterConfigVersion)
            .filter_by(campaign_id=campaign_id)
            .order_by(CharacterConfigVersion.version.desc())
            .first()
        )
        return CharacterConfigVersionRecord.from_persistence(model) if model else None

    def list_for_campaign(self, campaign_id: UUID) -> List[CharacterConfigVersionRecord]:
        models = (
            self.db.query(CharacterConfigVersion)
            .filter_by(campaign_id=campaign_id)
            .order_by(CharacterConfigVersion.version)
            .all()
        )
        return [CharacterConfigVersionRecord.from_persistence(model) for model in models]

    def insert(self, campaign_id: UUID, config: CharacterConfig, created_by: UUID) -> CharacterConfigVersionRecord:
        model = CharacterConfigVersion(
            campaign_id=campaign_id,
            version=config.version,
            config=config.model_dump(mode="json"),
            created_by=created_by,
        )
        self.db.add(model)
        self.db.commit()
        self.db.refresh(model)
        return CharacterConfigVersionRecord.from_persistence(model)
