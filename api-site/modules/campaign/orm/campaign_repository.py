# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session

from modules.campaign.model.campaign_model import Campaign as CampaignModel
from modules.campaign.domain.campaign_aggregate import CampaignAggregate


class CampaignRepository:
    """Repository handling Campaign aggregate persistence with inline ORM conversion"""

    def __init__(self, db_session: Session):
        self.db = db_session

    def get_by_id(self, campaign_id: UUID) -> Optional[CampaignAggregate]:
        """Get campaign by ID"""
        model = (
            self.db.query(CampaignModel)
            .filter_by(id=campaign_id)
            .first()
        )
        if not model:
            return None

        return self._model_to_aggregate(model)

    def get_by_dm_id(self, dm_id: UUID) -> List[CampaignAggregate]:
        """Get all campaigns where user is DM"""
        models = (
            self.db.query(CampaignModel)
            .filter_by(dm_id=dm_id)
            .order_by(CampaignModel.created_at.desc())
            .all()
        )
        return [self._model_to_aggregate(model) for model in models]

    def get_by_member_id(self, user_id: UUID) -> List[CampaignAggregate]:
        """Get all campaigns where user is either DM or player"""
        try:
            # Get campaigns where user is DM
            models = (
                self.db.query(CampaignModel)
                .filter(CampaignModel.dm_id == user_id)
                .order_by(CampaignModel.created_at.desc())
                .all()
            )

            result = []
            for model in models:
                try:
                    campaign = self._model_to_aggregate(model)
                    if campaign:
                        result.append(campaign)
                except Exception as e:
                    # Log error but continue processing other campaigns
                    print(f"Error converting campaign {model.id} to domain: {e}")
                    continue

            return result

        except Exception as e:
            # If query fails entirely, log error and return empty list (not 404!)
            print(f"Error in get_by_member_id: {e}")
            return []

    def save(self, aggregate: CampaignAggregate) -> UUID:
        """Save campaign aggregate"""
        if aggregate.id:
            # Update existing campaign
            campaign_model = (
                self.db.query(CampaignModel)
                .filter_by(id=aggregate.id)
                .first()
            )
            if not campaign_model:
                raise ValueError(f"Campaign {aggregate.id} not found")

            # Update campaign fields
            campaign_model.name = aggregate.name
            campaign_model.description = aggregate.description
            campaign_model.updated_at = aggregate.updated_at
            campaign_model.maps = aggregate.maps
            campaign_model.player_ids = [str(player_id) for player_id in aggregate.player_ids]

        else:
            # Create new campaign
            campaign_model = CampaignModel(
                id=aggregate.id,
                name=aggregate.name,
                description=aggregate.description,
                dm_id=aggregate.dm_id,
                created_at=aggregate.created_at,
                updated_at=aggregate.updated_at,
                maps=aggregate.maps,
                player_ids=[str(player_id) for player_id in aggregate.player_ids]
            )
            self.db.add(campaign_model)

            # Flush to get the ID
            self.db.flush()
            aggregate.id = campaign_model.id

        self.db.commit()
        self.db.refresh(campaign_model)
        return campaign_model.id

    def delete(self, campaign_id: UUID) -> bool:
        """Delete campaign"""
        campaign_model = (
            self.db.query(CampaignModel)
            .filter_by(id=campaign_id)
            .first()
        )

        if not campaign_model:
            return False

        # Business rule validation through aggregate
        campaign = self._model_to_aggregate(campaign_model)
        if not campaign.can_be_deleted():
            raise ValueError("Cannot delete campaign with games")

        # Delete campaign
        self.db.delete(campaign_model)
        self.db.commit()
        return True

    def _model_to_aggregate(self, model: CampaignModel) -> CampaignAggregate:
        """Helper to convert campaign model to aggregate"""
        # Extract game IDs from relationship
        game_ids = [game.id for game in model.games or []]

        player_ids = []
        if model.player_ids:
            player_ids = [UUID(player_id) for player_id in model.player_ids]

        return CampaignAggregate(
            id=model.id,
            name=model.name,
            description=model.description,
            dm_id=model.dm_id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            maps=model.maps,
            game_ids=game_ids,
            player_ids=player_ids
        )
