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
from modules.campaign.domain.campaign_role import CampaignRole


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

    def get_by_creator_id(self, creator_id: UUID) -> List[CampaignAggregate]:
        """Get all campaigns created by user"""
        models = (
            self.db.query(CampaignModel)
            .options(joinedload(CampaignModel.members))
            .filter_by(created_by=creator_id)
            .order_by(CampaignModel.created_at.desc())
            .all()
        )
        return [self._model_to_aggregate(model) for model in models]

    def get_by_member_id(self, user_id: UUID) -> List[CampaignAggregate]:
        """Get all campaigns where user is an active member (any role except invited)"""
        try:
            is_active_member = exists().where(
                and_(
                    CampaignMember.campaign_id == CampaignModel.id,
                    CampaignMember.user_id == user_id,
                    CampaignMember.role.in_([r.value for r in CampaignRole if r != CampaignRole.INVITED])
                )
            )
            models = (
                self.db.query(CampaignModel)
                .options(joinedload(CampaignModel.members))
                .filter(is_active_member)
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
                    CampaignMember.role == CampaignRole.INVITED.value
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
                created_by=aggregate.created_by,
                created_at=aggregate.created_at,
                updated_at=aggregate.updated_at
            )
            self.db.add(campaign_model)

            # Flush to get the ID
            self.db.flush()
            aggregate.id = campaign_model.id

            # Add initial members from aggregate
            for user_id, role in aggregate.members.items():
                self.db.add(CampaignMember(
                    campaign_id=campaign_model.id,
                    user_id=user_id,
                    role=role.value
                ))

        self.db.commit()
        self.db.refresh(campaign_model)
        return campaign_model.id

    def _sync_members(self, campaign_model: CampaignModel, aggregate: CampaignAggregate) -> None:
        """Diff and sync the campaign_members join table against aggregate members dict"""
        # Build desired state from aggregate
        desired = {uid: role.value for uid, role in aggregate.members.items()}

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
        session_ids = [session.id for session in model.sessions or []]

        # Build members dict from join table
        members = {}
        for member in (model.members or []):
            members[member.user_id] = CampaignRole.from_string(member.role)

        return CampaignAggregate(
            id=model.id,
            title=model.title,
            description=model.description,
            hero_image=model.hero_image,
            created_by=model.created_by,
            created_at=model.created_at,
            updated_at=model.updated_at,
            session_ids=session_ids,
            members=members
        )
