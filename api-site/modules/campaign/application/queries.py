# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List, Optional
from uuid import UUID

from sqlalchemy.orm import Session
from sqlalchemy import and_

from modules.campaign.domain.campaign_aggregate import CampaignAggregate
from modules.campaign.orm.campaign_repository import CampaignRepository


class GetUserCampaigns:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, user_id: UUID) -> List[CampaignAggregate]:
        """Get all campaigns where user is a member (DM or player) OR has a pending invite"""
        # Get campaigns where user is a member
        member_campaigns = self.repository.get_by_member_id(user_id)

        # Get campaigns where user has pending invite
        invited_campaigns = self.repository.get_invited_campaigns(user_id)

        # Combine both lists (no duplicates since a user can't be both invited and member)
        all_campaigns = member_campaigns + invited_campaigns

        return all_campaigns


class GetCampaignById:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, campaign_id: UUID) -> Optional[CampaignAggregate]:
        """Get campaign by ID"""
        return self.repository.get_by_id(campaign_id)


class GetUserHostedCampaigns:
    """Get campaigns where user is the DM/host"""

    def __init__(self, repository):
        self.repository = repository

    def execute(self, user_id: UUID) -> List[CampaignAggregate]:
        """Get all campaigns where user is the host (DM)"""
        return self.repository.get_by_host_id(user_id)


# Game-related queries moved to modules/game/application/queries.py
# - GetCampaignGames -> GetGamesByCampaign
# - GetGameById -> GetGameById (in game module)
# - CheckGameDMStatus -> Use game module instead


class GetCampaignMembers:
    """Query to get enriched campaign members with character details"""

    def __init__(self, campaign_repo: CampaignRepository, db_session: Session):
        self.campaign_repo = campaign_repo
        self.db = db_session

    def execute(self, campaign_id: UUID) -> List[dict]:
        """
        Returns list of campaign members with character details.

        Logic:
        1. Fetch campaign (get host_id + player_ids)
        2. For each member: LEFT JOIN User LEFT JOIN Character
        3. Character priority: available (no active_campaign) or most recent
        4. Format multi-class as "Fighter / Ranger"
        5. Sort: host first, then alphabetically
        """
        # Imports here to avoid circular dependencies between modules
        from modules.user.model.user_model import User
        from modules.characters.model.character_model import Character

        campaign = self.campaign_repo.get_by_id(campaign_id)
        if not campaign:
            return []

        member_ids = [campaign.host_id] + campaign.player_ids
        members = []

        for member_id in member_ids:
            is_host = (member_id == campaign.host_id)

            # Get user
            user = self.db.query(User).filter(User.id == member_id).first()
            if not user:
                continue

            # Get character (prefer available)
            character = (
                self.db.query(Character)
                .filter(
                    and_(
                        Character.user_id == member_id,
                        Character.is_deleted == False
                    )
                )
                .order_by(
                    Character.active_campaign.is_(None).desc(),
                    Character.created_at.desc()
                )
                .first()
            )

            # Format multi-class
            character_class_str = None
            if character and character.character_classes:
                character_class_str = ' / '.join([
                    cc['class'] for cc in character.character_classes
                ])

            members.append({
                'user_id': str(user.id),
                'username': user.screen_name or user.email,
                'account_tag': user.account_tag,
                'character_id': str(character.id) if character else None,
                'character_name': character.character_name if character else None,
                'character_level': character.level if character else None,
                'character_class': character_class_str,
                'character_race': character.character_race if character else None,
                'is_host': is_host
            })

        # Sort: host first, then alphabetically
        members.sort(key=lambda m: (not m['is_host'], m['username'].lower()))
        return members
