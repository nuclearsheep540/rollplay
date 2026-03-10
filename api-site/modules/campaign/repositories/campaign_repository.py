# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import logging
from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, and_, exists

logger = logging.getLogger(__name__)

from modules.campaign.model.campaign_model import Campaign as CampaignModel
from modules.campaign.model.campaign_member_model import CampaignMember
from modules.campaign.domain.campaign_aggregate import CampaignAggregate


class CampaignRepository:
    """Repository handling Campaign aggregate persistence with inline ORM conversion"""

    def __init__(self, db_session: Session):
        self.db = db_session

    def get_by_id(self, campaign_id: UUID) -> Optional[CampaignAggregate]:
        """Get campaign by ID"""
        model = (
            self.db.query(CampaignModel)
            .options(joinedload(CampaignModel.members))
            .filter_by(id=campaign_id)
            .first()
        )
        if not model:
            return None

        return self._model_to_aggregate(model)

    def get_by_host_id(self, host_id: UUID) -> List[CampaignAggregate]:
        """Get all campaigns where user is host"""
        models = (
            self.db.query(CampaignModel)
            .options(joinedload(CampaignModel.members))
            .filter_by(host_id=host_id)
            .order_by(CampaignModel.created_at.desc())
            .all()
        )
        return [self._model_to_aggregate(model) for model in models]

    def get_by_member_id(self, user_id: UUID) -> List[CampaignAggregate]:
        """Get all campaigns where user is either host or player (accepted invites only)"""
        try:
            is_player = exists().where(
                and_(
                    CampaignMember.campaign_id == CampaignModel.id,
                    CampaignMember.user_id == user_id,
                    CampaignMember.role == 'player'
                )
            )
            models = (
                self.db.query(CampaignModel)
                .options(joinedload(CampaignModel.members))
                .filter(
                    or_(
                        CampaignModel.host_id == user_id,
                        is_player
                    )
                )
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
                    logger.error("Error converting campaign %s to domain: %s", model.id, e)
                    continue

            return result

        except Exception as e:
            logger.error("Error in get_by_member_id: %s", e)
            return []

    def get_invited_campaigns(self, user_id: UUID) -> List[CampaignAggregate]:
        """Get all campaigns where user has a pending invite"""
        try:
            models = (
                self.db.query(CampaignModel)
                .options(joinedload(CampaignModel.members))
                .join(CampaignMember)
                .filter(
                    CampaignMember.user_id == user_id,
                    CampaignMember.role == 'invited'
                )
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
                    logger.error("Error converting campaign %s to domain: %s", model.id, e)
                    continue

            return result

        except Exception as e:
            logger.error("Error in get_invited_campaigns: %s", e)
            return []

    def save(self, aggregate: CampaignAggregate) -> UUID:
        """Save campaign aggregate with join table sync for members"""
        if aggregate.id:
            # Update existing campaign
            campaign_model = (
                self.db.query(CampaignModel)
                .options(joinedload(CampaignModel.members))
                .filter_by(id=aggregate.id)
                .first()
            )
            if not campaign_model:
                raise ValueError(f"Campaign {aggregate.id} not found")

            # Update campaign fields
            campaign_model.title = aggregate.title
            campaign_model.description = aggregate.description
            campaign_model.hero_image = aggregate.hero_image
            campaign_model.updated_at = aggregate.updated_at

            # Sync members join table
            self._sync_members(campaign_model, aggregate)

        else:
            # Create new campaign
            campaign_model = CampaignModel(
                id=aggregate.id,
                title=aggregate.title,
                description=aggregate.description,
                hero_image=aggregate.hero_image,
                host_id=aggregate.host_id,
                created_at=aggregate.created_at,
                updated_at=aggregate.updated_at
            )
            self.db.add(campaign_model)

            # Flush to get the ID
            self.db.flush()
            aggregate.id = campaign_model.id

            # Add initial members if any
            for player_id in aggregate.player_ids:
                self.db.add(CampaignMember(
                    campaign_id=campaign_model.id,
                    user_id=player_id,
                    role='player'
                ))
            for player_id in aggregate.invited_player_ids:
                self.db.add(CampaignMember(
                    campaign_id=campaign_model.id,
                    user_id=player_id,
                    role='invited'
                ))

        self.db.commit()
        self.db.refresh(campaign_model)
        return campaign_model.id

    def _sync_members(self, campaign_model: CampaignModel, aggregate: CampaignAggregate) -> None:
        """Diff and sync the campaign_members join table against aggregate lists"""
        # Build desired state from aggregate
        desired = {}
        for pid in aggregate.player_ids:
            desired[pid] = 'player'
        for pid in aggregate.invited_player_ids:
            desired[pid] = 'invited'

        # Build current state from join table
        current_members = {m.user_id: m for m in campaign_model.members}

        # Delete removed members
        for user_id, member in current_members.items():
            if user_id not in desired:
                self.db.delete(member)

        # Update role changes and insert new members
        for user_id, role in desired.items():
            if user_id in current_members:
                if current_members[user_id].role != role:
                    current_members[user_id].role = role
            else:
                self.db.add(CampaignMember(
                    campaign_id=campaign_model.id,
                    user_id=user_id,
                    role=role
                ))

    def delete(self, campaign_id: UUID) -> bool:
        """
        Delete campaign from database.

        Note: Business rule validation (checking for active games)
        happens at the command level, not here.
        """
        campaign_model = (
            self.db.query(CampaignModel)
            .filter_by(id=campaign_id)
            .first()
        )

        if not campaign_model:
            return False

        # Delete campaign (cascade deletes members and sessions via foreign key)
        self.db.delete(campaign_model)
        self.db.commit()
        return True

    def _model_to_aggregate(self, model: CampaignModel) -> CampaignAggregate:
        """Helper to convert campaign model to aggregate"""
        # Extract session IDs from relationship
        session_ids = [session.id for session in model.sessions or []]

        # Split members by role into two UUID lists
        invited_player_ids = []
        player_ids = []
        for member in (model.members or []):
            if member.role == 'invited':
                invited_player_ids.append(member.user_id)
            elif member.role == 'player':
                player_ids.append(member.user_id)

        return CampaignAggregate(
            id=model.id,
            title=model.title,
            description=model.description,
            hero_image=model.hero_image,
            host_id=model.host_id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            session_ids=session_ids,
            invited_player_ids=invited_player_ids,
            player_ids=player_ids
        )
