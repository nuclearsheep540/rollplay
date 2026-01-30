# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import Optional
from uuid import UUID
import logging
import asyncio

from modules.campaign.domain.campaign_aggregate import CampaignAggregate
from modules.campaign.domain.campaign_events import CampaignEvents
from modules.events.event_manager import EventManager
from modules.user.orm.user_repository import UserRepository
from modules.characters.orm.character_repository import CharacterRepository

logger = logging.getLogger(__name__)


class CreateCampaign:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, host_id: UUID, title: str, description: str = "", hero_image: Optional[str] = None) -> CampaignAggregate:
        """Create a new campaign"""
        campaign = CampaignAggregate.create(
            title=title,
            description=description,
            host_id=host_id,
            hero_image=hero_image
        )

        self.repository.save(campaign)
        return campaign


class UpdateCampaign:
    def __init__(self, repository, session_repository=None):
        self.repository = repository
        self.session_repository = session_repository

    def execute(
        self,
        campaign_id: UUID,
        host_id: UUID,
        title: Optional[str] = None,
        description: Optional[str] = None,
        hero_image: Optional[str] = "UNSET",
        session_name: Optional[str] = None
    ) -> CampaignAggregate:
        """Update campaign details and optionally current session name"""
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        # Business rule: Only host can update campaign
        if not campaign.is_owned_by(host_id):
            raise ValueError("Only the host can update this campaign")

        campaign.update_details(title=title, description=description, hero_image=hero_image)
        self.repository.save(campaign)

        # Update current session name if provided and session_repository available
        if session_name is not None and self.session_repository:
            from modules.session.domain.session_aggregate import SessionStatus
            sessions = self.session_repository.get_by_campaign_id(campaign_id)
            # Find current (non-finished) session
            current_session = next(
                (s for s in sessions if s.status != SessionStatus.FINISHED),
                None
            )
            if current_session:
                current_session.name = session_name
                self.session_repository.save(current_session)

        return campaign


class DeleteCampaign:
    def __init__(self, repository, session_repository=None):
        self.repository = repository
        self.session_repository = session_repository

    def execute(self, campaign_id: UUID, host_id: UUID) -> bool:
        """Delete campaign if business rules allow"""
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            return False

        # Business rule: Only host can delete campaign
        if not campaign.is_owned_by(host_id):
            raise ValueError("Only the host can delete this campaign")

        # Business rule: Cannot delete campaign with non-FINISHED sessions
        if self.session_repository:
            from modules.session.domain.session_aggregate import SessionStatus
            non_finished_sessions = []
            for session_id in campaign.session_ids:
                session = self.session_repository.get_by_id(session_id)
                if session and session.status != SessionStatus.FINISHED:
                    non_finished_sessions.append(session)

            if non_finished_sessions:
                count = len(non_finished_sessions)
                raise ValueError(f"Cannot delete campaign with {count} unfinished session(s). Please finish or delete all sessions first.")

        return self.repository.delete(campaign_id)


class AddPlayerToCampaign:
    def __init__(self, repository, user_repo: UserRepository, event_manager: EventManager):
        self.repository = repository
        self.user_repo = user_repo
        self.event_manager = event_manager

    async def execute(self, campaign_id: UUID, player_id: UUID, host_id: UUID) -> CampaignAggregate:
        """Invite a player to the campaign (host only) - sends pending invite"""
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        # Business rule: Only host can invite players
        if not campaign.is_owned_by(host_id):
            raise ValueError("Only the host can invite players to this campaign")

        # Business logic in aggregate - sends invite (goes to invited_player_ids)
        campaign.invite_player(player_id)

        # Save
        self.repository.save(campaign)

        # Get user details for notifications
        host = self.user_repo.get_by_id(host_id)
        player = self.user_repo.get_by_id(player_id)

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # DUAL BROADCAST: One invite action fires TWO separate WebSocket events:
        #   1. campaign_invite_received → sent to the INVITED PLAYER
        #   2. campaign_invite_sent     → sent to the HOST as confirmation
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        # Broadcast 1/2: Notification to invited player
        await self.event_manager.broadcast(
            **CampaignEvents.campaign_invite_received(
                invited_player_id=player_id,
                campaign_id=campaign_id,
                campaign_name=campaign.title,
                host_id=host_id,
                host_screen_name=host.screen_name if host else "Unknown"
            )
        )

        # Broadcast 2/2: Confirmation to host
        await self.event_manager.broadcast(
            **CampaignEvents.campaign_invite_sent(
                host_id=host_id,
                campaign_id=campaign_id,
                campaign_name=campaign.title,
                player_id=player_id,
                player_screen_name=player.screen_name if player else "Unknown"
            )
        )

        return campaign


class RemovePlayerFromCampaign:
    def __init__(self, repository, user_repo: UserRepository, event_manager: EventManager, character_repo: CharacterRepository = None):
        self.repository = repository
        self.user_repo = user_repo
        self.event_manager = event_manager
        self.character_repo = character_repo

    async def execute(self, campaign_id: UUID, player_id: UUID, host_id: UUID) -> CampaignAggregate:
        """Remove a player from the campaign (host only)"""
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        # Business rule: Only host can remove players
        if not campaign.is_owned_by(host_id):
            raise ValueError("Only the host can remove players from this campaign")

        # Get player details for notification before removing
        player = self.user_repo.get_by_id(player_id)

        # Unlock player's character from this campaign (if they have one selected)
        if self.character_repo:
            character = self.character_repo.get_user_character_for_campaign(player_id, campaign_id)
            if character:
                character.unlock_from_campaign()
                self.character_repo.save(character)
                logger.info(f"Unlocked character {character.id} from campaign {campaign_id} (player removed by host)")

        # Business logic in aggregate
        campaign.remove_player(player_id)

        # Save
        self.repository.save(campaign)

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # DUAL BROADCAST: One remove action fires TWO separate WebSocket events:
        #   1. campaign_player_removed              → sent to the PLAYER
        #   2. campaign_player_removed_confirmation → sent to the HOST
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        # Broadcast 1/2: Notification to the removed player
        await self.event_manager.broadcast(
            **CampaignEvents.campaign_player_removed(
                removed_player_id=player_id,
                campaign_id=campaign_id,
                campaign_name=campaign.title,
                removed_by_id=host_id
            )
        )

        # Broadcast 2/2: Confirmation to the host
        await self.event_manager.broadcast(
            **CampaignEvents.campaign_player_removed_confirmation(
                host_id=host_id,
                campaign_id=campaign_id,
                campaign_name=campaign.title,
                player_screen_name=player.screen_name if player else "Unknown"
            )
        )

        return campaign


class AcceptCampaignInvite:
    def __init__(self, repository, user_repo: UserRepository, event_manager: EventManager, session_repository=None):
        self.repository = repository
        self.user_repo = user_repo
        self.event_manager = event_manager
        self.session_repository = session_repository

    async def execute(self, campaign_id: UUID, player_id: UUID) -> CampaignAggregate:
        """
        Player accepts their campaign invite.

        Also automatically adds player to any active sessions in the campaign.
        """
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        # Business logic in aggregate - moves from invited_player_ids to player_ids
        campaign.accept_invite(player_id)

        # Save
        self.repository.save(campaign)

        # Add player to any active sessions in this campaign and track which ones
        auto_added_to_session_ids = []
        if self.session_repository:
            from modules.session.domain.session_aggregate import SessionStatus
            # Get all sessions for this campaign
            for session_id in campaign.session_ids:
                session = self.session_repository.get_by_id(session_id)
                if session and session.status == SessionStatus.ACTIVE:
                    # Add player to active session if not already joined
                    if player_id not in session.joined_users:
                        session.joined_users.append(player_id)
                        self.session_repository.save(session)
                        auto_added_to_session_ids.append(session_id)
                        logger.info(f"✅ Auto-added late-joining player {player_id} to active session {session_id}")

        # Broadcast notification event to host
        player = self.user_repo.get_by_id(player_id)
        await self.event_manager.broadcast(
            **CampaignEvents.campaign_invite_accepted(
                host_id=campaign.host_id,
                campaign_id=campaign_id,
                campaign_name=campaign.title,
                player_id=player_id,
                player_screen_name=player.screen_name if player else "Unknown",
                auto_added_to_session_ids=auto_added_to_session_ids
            )
        )

        return campaign


class DeclineCampaignInvite:
    def __init__(self, repository, user_repo: UserRepository, event_manager: EventManager):
        self.repository = repository
        self.user_repo = user_repo
        self.event_manager = event_manager

    async def execute(self, campaign_id: UUID, player_id: UUID) -> CampaignAggregate:
        """Player declines their campaign invite"""
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        # Business logic in aggregate - removes from invited_player_ids
        campaign.decline_invite(player_id)

        # Save
        self.repository.save(campaign)

        # Broadcast state update to host (no toast, but updates their local state)
        player = self.user_repo.get_by_id(player_id)
        await self.event_manager.broadcast(
            **CampaignEvents.campaign_invite_declined(
                host_id=campaign.host_id,
                campaign_id=campaign_id,
                campaign_name=campaign.title,
                player_id=player_id,
                player_screen_name=player.screen_name if player else "Unknown"
            )
        )

        return campaign


class LeaveCampaign:
    def __init__(self, repository, user_repo: UserRepository, event_manager: EventManager, character_repo: CharacterRepository = None):
        self.repository = repository
        self.user_repo = user_repo
        self.event_manager = event_manager
        self.character_repo = character_repo

    async def execute(self, campaign_id: UUID, player_id: UUID) -> CampaignAggregate:
        """Player voluntarily leaves a campaign they've joined"""
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        # Business rule: Host cannot leave their own campaign
        if campaign.is_owned_by(player_id):
            raise ValueError("Host cannot leave their own campaign")

        # Business rule: Player must be a member to leave
        if not campaign.is_player(player_id):
            raise ValueError("You are not a member of this campaign")

        # Get player details for notification before removing
        player = self.user_repo.get_by_id(player_id)

        # Unlock player's character from this campaign (if they have one selected)
        if self.character_repo:
            character = self.character_repo.get_user_character_for_campaign(player_id, campaign_id)
            if character:
                character.unlock_from_campaign()
                self.character_repo.save(character)
                logger.info(f"Unlocked character {character.id} from campaign {campaign_id} (player leaving)")

        # Business logic in aggregate - removes from player_ids
        campaign.remove_player(player_id)

        # Save
        self.repository.save(campaign)

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # DUAL BROADCAST: One leave action fires TWO separate WebSocket events:
        #   1. campaign_player_left              → sent to the HOST
        #   2. campaign_player_left_confirmation → sent to the PLAYER
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        # Broadcast 1/2: Notification to host that player left
        await self.event_manager.broadcast(
            **CampaignEvents.campaign_player_left(
                host_id=campaign.host_id,
                campaign_id=campaign_id,
                campaign_name=campaign.title,
                player_id=player_id,
                player_screen_name=player.screen_name if player else "Unknown"
            )
        )

        # Broadcast 2/2: Confirmation to the player who left
        await self.event_manager.broadcast(
            **CampaignEvents.campaign_player_left_confirmation(
                player_id=player_id,
                campaign_id=campaign_id,
                campaign_name=campaign.title
            )
        )

        return campaign


class CancelCampaignInvite:
    def __init__(self, repository, user_repo: UserRepository, event_manager: EventManager):
        self.repository = repository
        self.user_repo = user_repo
        self.event_manager = event_manager

    async def execute(self, campaign_id: UUID, player_id: UUID, host_id: UUID) -> CampaignAggregate:
        """Host cancels a pending invite before it's accepted"""
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        # Business rule: Only host can cancel invites
        if not campaign.is_owned_by(host_id):
            raise ValueError("Only the host can cancel invites for this campaign")

        # Get player details for notification before removing
        player = self.user_repo.get_by_id(player_id)

        # Business logic in aggregate - removes from invited_player_ids
        campaign.cancel_invite(player_id)

        # Save
        self.repository.save(campaign)

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # DUAL BROADCAST: One cancel action fires TWO separate WebSocket events:
        #   1. campaign_invite_canceled              → sent to the PLAYER
        #   2. campaign_invite_canceled_confirmation → sent to the HOST
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        # Broadcast 1/2: Notification to the player whose invite was canceled
        await self.event_manager.broadcast(
            **CampaignEvents.campaign_invite_canceled(
                player_id=player_id,
                campaign_id=campaign_id,
                campaign_name=campaign.title
            )
        )

        # Broadcast 2/2: Confirmation to the host
        await self.event_manager.broadcast(
            **CampaignEvents.campaign_invite_canceled_confirmation(
                host_id=host_id,
                campaign_id=campaign_id,
                campaign_name=campaign.title,
                player_screen_name=player.screen_name if player else "Unknown"
            )
        )

        return campaign


class SelectCharacterForCampaign:
    """
    Select a character to use in a campaign. Locks character to campaign.

    Domain Rule: A character can only be active in one campaign at a time.
    """

    def __init__(self, campaign_repo, character_repo: CharacterRepository):
        self.campaign_repo = campaign_repo
        self.character_repo = character_repo

    def execute(self, campaign_id: UUID, user_id: UUID, character_id: UUID):
        """
        Select a character for use in this campaign.

        Validates:
        - User is a member of the campaign
        - Character is owned by the user
        - Character is not locked to another campaign

        On success, locks the character to this campaign.
        """
        # Get campaign
        campaign = self.campaign_repo.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        # Business rule: User must be a member of the campaign
        if not campaign.is_member(user_id):
            raise ValueError("You are not a member of this campaign")

        # Get character
        character = self.character_repo.get_by_id(character_id)
        if not character:
            raise ValueError(f"Character {character_id} not found")

        # Business rule: Character must be owned by the user
        if not character.is_owned_by(user_id):
            raise ValueError("You do not own this character")

        # Business rule: Character must not be locked to another campaign
        if character.is_locked() and character.active_campaign != campaign_id:
            raise ValueError(f"Character is already locked to another campaign")

        # If already locked to THIS campaign, nothing to do
        if character.active_campaign == campaign_id:
            return character

        # Lock character to campaign
        character.lock_to_campaign(campaign_id)
        self.character_repo.save(character)

        logger.info(f"Character {character_id} locked to campaign {campaign_id} by user {user_id}")
        return character


class ReleaseCharacterFromCampaign:
    """
    Release character from campaign without leaving the campaign.

    Domain Rule: Only allowed when no active session exists in the campaign.
    Player stays as campaign member but can now use their character elsewhere.
    """

    def __init__(self, campaign_repo, character_repo: CharacterRepository, session_repo=None):
        self.campaign_repo = campaign_repo
        self.character_repo = character_repo
        self.session_repo = session_repo

    def execute(self, campaign_id: UUID, user_id: UUID):
        """
        Release the user's character from this campaign.

        Validates:
        - User is a member of the campaign
        - User has a character selected for this campaign
        - No active session exists in the campaign

        On success, unlocks the character from this campaign.
        """
        # Get campaign
        campaign = self.campaign_repo.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        # Business rule: User must be a member of the campaign
        if not campaign.is_member(user_id):
            raise ValueError("You are not a member of this campaign")

        # Business rule: No active sessions
        if self.session_repo:
            from modules.session.domain.session_aggregate import SessionStatus
            for session_id in campaign.session_ids:
                session = self.session_repo.get_by_id(session_id)
                if session and session.status == SessionStatus.ACTIVE:
                    raise ValueError("Cannot release character while a session is active")

        # Get user's character for this campaign
        character = self.character_repo.get_user_character_for_campaign(user_id, campaign_id)
        if not character:
            raise ValueError("You don't have a character selected for this campaign")

        # Unlock character
        character.unlock_from_campaign()
        self.character_repo.save(character)

        logger.info(f"Character {character.id} released from campaign {campaign_id} by user {user_id}")
        return character

