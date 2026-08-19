# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List, Optional
from uuid import UUID

from sqlalchemy.orm import Session, selectinload
from sqlalchemy import and_

from modules.campaign.domain.campaign_aggregate import CampaignAggregate
from modules.campaign.domain.campaign_role import CampaignRole
from modules.campaign.repositories.campaign_repository import CampaignRepository


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
        return self.repository.get_by_creator_id(user_id)


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
        1. Fetch campaign (get all active members via roles)
        2. For each member: Get user info and character LOCKED to THIS campaign
        3. Only shows character if it's actually selected for this campaign
        4. Format multi-class as "Fighter / Ranger"
        5. Sort: DM first, then alphabetically
        """
        # Imports here to avoid circular dependencies between modules
        from modules.user.model.user_model import User
        from modules.characters.model.character_model import Character
        from modules.characters.model.character_class_model import CharacterClassEntry

        campaign = self.campaign_repo.get_by_id(campaign_id)
        if not campaign:
            return []

        # Get all active members (excludes INVITED)
        active_member_ids = campaign.get_all_member_ids()
        members = []

        for member_id in active_member_ids:
            role = campaign.get_role(member_id)

            # Get user
            user = self.db.query(User).filter(User.id == member_id).first()
            if not user:
                continue

            # Get character locked to THIS campaign (not just any character owned by user)
            character = (
                self.db.query(Character)
                .options(selectinload(Character.class_entries))
                .filter(
                    and_(
                        Character.user_id == member_id,
                        Character.active_in_campaign_id == campaign_id,
                        Character.is_deleted == False
                    )
                )
                .first()
            )

            # Format multi-class as "Barbarian / Rogue" (code title-cased).
            character_class_str = None
            if character and character.class_entries:
                character_class_str = ' / '.join(
                    entry.class_code.replace("_", " ").title() for entry in character.class_entries
                )

            members.append({
                'user_id': str(user.id),
                'username': user.screen_name or user.email,
                'account_tag': user.account_tag,
                'campaign_role': role.value if role else 'spectator',
                'character_id': str(character.id) if character else None,
                'character_name': character.character_name if character else None,
                'character_level': character.level if character else None,
                'character_class': character_class_str,
                'character_race': (
                    character.species_code.replace("_", " ").title()
                    if character and character.species_code else None
                ),
                # Raw S3 key - the endpoint layer resolves a presigned URL
                # (avatar_asset is lazy="joined", so no extra query here)
                'character_avatar_s3_key': (
                    character.avatar_asset.s3_key
                    if character and character.avatar_asset else None
                ),
                # The avatar image's "token" focal square (tokens v3, decision
                # 36) - same already-loaded asset, so still no extra query.
                # getattr-guarded like CharacterRepository: a legacy non-image
                # avatar row must degrade to None rather than raise.
                'character_avatar_focal_area': (
                    (getattr(character.avatar_asset, "focal_areas", None) or {}).get("token")
                    if character and character.avatar_asset else None
                ),
                # Stable cache key for the frontend's AssetDownloadManager. The
                # presigned URL above is re-signed on every request, so it can't
                # identify the image across refetches - the asset id can, which
                # is what stops the party wedge re-downloading an unchanged
                # avatar. Guarded on avatar_asset (not the raw FK column) so
                # this stays in lockstep with the two fields above: either all
                # three describe an avatar, or all three are None.
                'character_avatar_asset_id': (
                    str(character.avatar_asset_id)
                    if character and character.avatar_asset else None
                ),
                'is_host': role == CampaignRole.DM
            })

        # Sort: DM first, then alphabetically
        members.sort(key=lambda m: (not m['is_host'], m['username']))
        return members
