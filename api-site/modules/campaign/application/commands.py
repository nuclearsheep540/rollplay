# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import Optional
from uuid import UUID
import logging
import asyncio

from modules.campaign.domain.campaign_aggregate import CampaignAggregate
from shared_contracts.character_config import CharacterConfig, diff_configs
from modules.characters.api.schemas import PlayerCharacterUpdate
from shared.services.game_notifier import GameNotifier
from modules.campaign.domain.character_config_version import CharacterConfigVersionRecord
from modules.campaign.domain.campaign_role import CampaignRole
from modules.campaign.domain.campaign_events import CampaignEvents
from modules.events.event_manager import EventManager
from modules.user.repositories.user_repository import UserRepository
from modules.characters.repositories.character_repository import CharacterRepository

logger = logging.getLogger(__name__)



def _eject_party_character(character_repo, session_repo, campaign_id, user_id, reason):
    """Unbind a user's party character from this campaign's table, if they have one.

    Shared by the three commands that take someone off a campaign. The character becomes a
    keepsake — the same state ejecting produces — rather than being deleted.
    """
    # One campaign, one session, for life — so the first row is the table.
    sessions = session_repo.get_by_campaign_id(campaign_id) if session_repo else []
    if not sessions:
        return
    character = character_repo.get_party_character(sessions[0].id, user_id)
    if character is None:
        return
    character.unbind_from_table()
    character_repo.save(character)
    logger.info(f"Unbound character {character.id} from campaign {campaign_id} ({reason})")


class CreateCampaign:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, host_id: UUID, title: str, description: str = "", hero_image: Optional[str] = None, hero_image_asset_id: Optional[UUID] = None, max_players: int = 8, system_name: Optional[str] = None) -> CampaignAggregate:
        """Create a new campaign. The creator becomes the DM."""
        campaign = CampaignAggregate.create(
            title=title,
            description=description,
            created_by=host_id,
            hero_image=hero_image,
            hero_image_asset_id=hero_image_asset_id,
            max_players=max_players,
            system_name=system_name,
        )

        self.repository.save(campaign)
        return campaign


class UpdateCampaign:
    def __init__(self, repository):
        self.repository = repository

    def execute(
        self,
        campaign_id: UUID,
        host_id: UUID,
        title: Optional[str] = None,
        description: Optional[str] = None,
        hero_image: Optional[str] = "UNSET",
        hero_image_asset_id: Optional[str] = "UNSET",
        max_players: Optional[int] = None,
        system_name: Optional[str] = "UNSET",
    ) -> CampaignAggregate:
        """Update campaign details.

        Deliberately unguarded against a live game: campaign data is cold, it
        never crosses the ETL, and a campaign has exactly one editor. A seat
        count changed mid-game simply applies at the next start.
        """
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        # Business rule: Only DM can update campaign
        if not campaign.is_dm(host_id):
            raise ValueError("Only the DM can update this campaign")

        campaign.update_details(
            title=title,
            description=description,
            hero_image=hero_image,
            hero_image_asset_id=hero_image_asset_id,
            max_players=max_players,
            system_name=system_name,
        )
        self.repository.save(campaign)

        return campaign


class DeleteCampaign:
    def __init__(self, repository, game_repository=None, event_manager: EventManager = None):
        self.repository = repository
        self.game_repository = game_repository
        self.event_manager = event_manager

    async def execute(self, campaign_id: UUID, host_id: UUID) -> bool:
        """Delete campaign if business rules allow"""
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            return False

        # Business rule: Only DM can delete campaign
        if not campaign.is_dm(host_id):
            raise ValueError("Only the DM can delete this campaign")

        # Business rule: a running game blocks deletion — its state is hot in
        # api-game and players are in it. Otherwise the campaign's session and
        # every game played at it go with the campaign (both cascade on delete).
        if self.game_repository and self.game_repository.get_open_game_for_campaign(campaign_id):
            raise ValueError("End the game before deleting this campaign")

        # Characters survive as keepsakes. Nothing to do here: the database's
        # ON DELETE SET NULL on characters.campaign_id and characters.session_id nulls
        # their pointers as the campaign and its session go, which is the same keepsake
        # state ejection produces. Doing it in application code as well would be a second
        # implementation of one rule.

        # Broadcast before delete — we need campaign data for the event
        if self.event_manager:
            all_member_ids = list(campaign.members.keys())
            events = CampaignEvents.campaign_deleted(
                campaign_member_ids=all_member_ids,
                dm_id=host_id,
                campaign_id=campaign_id,
                campaign_name=campaign.title,
            )
            for event in events:
                await self.event_manager.broadcast(event)

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

        # Business rule: Only DM can invite players
        if not campaign.is_dm(host_id):
            raise ValueError("Only the DM can invite players to this campaign")

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
            CampaignEvents.campaign_invite_received(
                invited_player_id=player_id,
                campaign_id=campaign_id,
                campaign_name=campaign.title,
                host_id=host_id,
                host_screen_name=host.screen_name if host else "Unknown"
            )
        )

        # Broadcast 2/2: Confirmation to host
        await self.event_manager.broadcast(
            CampaignEvents.campaign_invite_sent(
                host_id=host_id,
                campaign_id=campaign_id,
                campaign_name=campaign.title,
                player_id=player_id,
                player_screen_name=player.screen_name if player else "Unknown"
            )
        )

        return campaign


class RemovePlayerFromCampaign:
    def __init__(self, repository, user_repo: UserRepository, event_manager: EventManager,
                 character_repo: CharacterRepository = None, session_repo=None):
        self.repository = repository
        self.user_repo = user_repo
        self.event_manager = event_manager
        self.character_repo = character_repo
        self.session_repo = session_repo

    async def execute(self, campaign_id: UUID, player_id: UUID, host_id: UUID) -> CampaignAggregate:
        """Remove a player from the campaign (host only)"""
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        # Business rule: Only DM can remove players
        if not campaign.is_dm(host_id):
            raise ValueError("Only the DM can remove players from this campaign")

        # Get player details for notification before removing
        player = self.user_repo.get_by_id(player_id)

        # Off the campaign means out of the party: unbind their character so it becomes a
        # keepsake rather than a row pointing at a table they are not at.
        if self.character_repo:
            _eject_party_character(self.character_repo, self.session_repo, campaign_id,
                                   player_id, "player removed by host")

        # Business logic in aggregate
        campaign.remove_member(player_id)

        # Save
        self.repository.save(campaign)

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # DUAL BROADCAST: One remove action fires TWO separate WebSocket events:
        #   1. campaign_player_removed              → sent to the PLAYER
        #   2. campaign_player_removed_confirmation → sent to the HOST
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        # Broadcast 1/2: Notification to the removed player
        await self.event_manager.broadcast(
            CampaignEvents.campaign_player_removed(
                removed_player_id=player_id,
                campaign_id=campaign_id,
                campaign_name=campaign.title,
                removed_by_id=host_id
            )
        )

        # Broadcast 2/2: Confirmation to the host
        await self.event_manager.broadcast(
            CampaignEvents.campaign_player_removed_confirmation(
                host_id=host_id,
                campaign_id=campaign_id,
                campaign_name=campaign.title,
                player_screen_name=player.screen_name if player else "Unknown"
            )
        )

        return campaign


class AcceptCampaignInvite:
    def __init__(self, repository, user_repo: UserRepository, event_manager: EventManager, session_repository=None, game_repository=None):
        self.repository = repository
        self.user_repo = user_repo
        self.event_manager = event_manager
        self.session_repository = session_repository
        self.game_repository = game_repository

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
        player = self.user_repo.get_by_id(player_id)
        player_name = player.screen_name if player else ""

        # Add the late-joining player to the campaign's table, and to the room
        # if a game is running. The roster is the party, so they join it whether
        # or not anything is live; the hot sync only happens for a live game.
        session = None
        for session_id in campaign.session_ids:
            session = self.session_repository.get_by_id(session_id) if self.session_repository else None
            break
        if session:
            if player_id not in session.joined_users:
                session.joined_users.append(player_id)
                self.session_repository.save(session)
                auto_added_to_session_ids.append(session.id)
                logger.info(f"Auto-added late-joining player {player_id} to the party of session {session.id}")

            # Tell the running game about the new player, addressed by the GAME's id
            # (which is the room id). Identity only, with no character half — a late
            # joiner has not built one — which is the documented meaning of an absent
            # character half, not an accident of which keys we happened to send.
            open_game = self.game_repository.get_open_game_for_campaign(campaign_id) if self.game_repository else None
            if open_game and open_game.status.value == "active":
                role = campaign.get_role(player_id)
                await GameNotifier().sync_player(open_game.id, PlayerCharacterUpdate(
                    user_id=str(player_id),
                    player_name=player_name,
                    campaign_role=role.value if role else "spectator",
                ))

        # Broadcast notification event to host
        await self.event_manager.broadcast(
            CampaignEvents.campaign_invite_accepted(
                host_id=campaign.dm_id,
                campaign_id=campaign_id,
                campaign_name=campaign.title,
                player_id=player_id,
                player_screen_name=player.screen_name if player else "Unknown",
                auto_added_to_session_ids=auto_added_to_session_ids
            )
        )

        return campaign


class SaveCharacterConfigDraft:
    """The host writes their working copy of the character config.

    Save is not publish. Any number of saves land on one draft row and version nothing;
    PublishCharacterConfigVersion is what mints a version from it.
    """

    def __init__(self, campaign_repository, version_repository):
        self.repository = campaign_repository
        self.version_repository = version_repository

    def execute(self, campaign_id: UUID, host_id: UUID, config: CharacterConfig) -> CampaignAggregate:
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")
        if campaign.created_by != host_id:
            raise PermissionError("Only the host can edit the character config")

        latest = self.version_repository.get_latest(campaign_id)
        next_version = (latest.version + 1) if latest else 1
        campaign.set_character_config_draft(config, next_version)
        self.repository.save(campaign)
        return campaign


class PublishCharacterConfigVersion:
    """Mint the next immutable version from the draft, then clear the draft.

    Refuses a draft that differs from the latest published version in no way, so the GM
    cannot fill their version list with identical entries by pressing the button twice.
    """

    def __init__(self, campaign_repository, version_repository):
        self.repository = campaign_repository
        self.version_repository = version_repository

    def execute(self, campaign_id: UUID, host_id: UUID) -> CharacterConfigVersionRecord:
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")
        if campaign.created_by != host_id:
            raise PermissionError("Only the host can publish the character config")

        draft = campaign.character_config_draft
        if draft is None:
            raise ValueError("Nothing to publish: save a draft first")

        latest = self.version_repository.get_latest(campaign_id)
        if latest and not diff_configs(latest.config, draft):
            raise ValueError(f"No changes since v{latest.version}")

        record = self.version_repository.insert(campaign_id, draft, host_id)
        campaign.clear_character_config_draft()
        self.repository.save(campaign)
        return record


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
            CampaignEvents.campaign_invite_declined(
                host_id=campaign.dm_id,
                campaign_id=campaign_id,
                campaign_name=campaign.title,
                player_id=player_id,
                player_screen_name=player.screen_name if player else "Unknown"
            )
        )

        return campaign


class LeaveCampaign:
    def __init__(self, repository, user_repo: UserRepository, event_manager: EventManager,
                 character_repo: CharacterRepository = None, session_repo=None):
        self.repository = repository
        self.user_repo = user_repo
        self.event_manager = event_manager
        self.character_repo = character_repo
        self.session_repo = session_repo

    async def execute(self, campaign_id: UUID, player_id: UUID) -> CampaignAggregate:
        """Player voluntarily leaves a campaign they've joined"""
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        # Business rule: DM cannot leave their own campaign
        if campaign.is_dm(player_id):
            raise ValueError("DM cannot leave their own campaign")

        # Business rule: Must be an active member to leave
        if not campaign.is_member(player_id):
            raise ValueError("You are not a member of this campaign")

        # Get player details for notification before removing
        player = self.user_repo.get_by_id(player_id)

        # Leaving the campaign leaves the party too; the character survives as a keepsake.
        if self.character_repo:
            _eject_party_character(self.character_repo, self.session_repo, campaign_id,
                                   player_id, "player leaving")

        # Business logic in aggregate - removes member
        campaign.remove_member(player_id)

        # Save
        self.repository.save(campaign)

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # DUAL BROADCAST: One leave action fires TWO separate WebSocket events:
        #   1. campaign_player_left              → sent to the HOST
        #   2. campaign_player_left_confirmation → sent to the PLAYER
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        # Broadcast 1/2: Notification to host that player left
        await self.event_manager.broadcast(
            CampaignEvents.campaign_player_left(
                host_id=campaign.dm_id,
                campaign_id=campaign_id,
                campaign_name=campaign.title,
                player_id=player_id,
                player_screen_name=player.screen_name if player else "Unknown"
            )
        )

        # Broadcast 2/2: Confirmation to the player who left
        await self.event_manager.broadcast(
            CampaignEvents.campaign_player_left_confirmation(
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

        # Business rule: Only DM can cancel invites
        if not campaign.is_dm(host_id):
            raise ValueError("Only the DM can cancel invites for this campaign")

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
            CampaignEvents.campaign_invite_canceled(
                player_id=player_id,
                campaign_id=campaign_id,
                campaign_name=campaign.title
            )
        )

        # Broadcast 2/2: Confirmation to the host
        await self.event_manager.broadcast(
            CampaignEvents.campaign_invite_canceled_confirmation(
                host_id=host_id,
                campaign_id=campaign_id,
                campaign_name=campaign.title,
                player_screen_name=player.screen_name if player else "Unknown"
            )
        )

        return campaign


class SetMemberRole:
    """
    Set a campaign member's role. Called by api-game via internal endpoint.

    Domain rules enforced:
    - Requesting user must be the DM
    - Target must be a member
    - Cannot change DM role (handled by aggregate)
    - If promoting to MOD: target must not have a selected character
    """

    def __init__(self, campaign_repo, character_repo: CharacterRepository,
                 event_manager: Optional[EventManager] = None, session_repo=None):
        self.session_repo = session_repo
        self.campaign_repo = campaign_repo
        self.character_repo = character_repo
        self.event_manager = event_manager

    async def execute(self, campaign_id: UUID, requesting_user_id: UUID, target_user_id: UUID, new_role: str) -> CampaignAggregate:
        campaign = self.campaign_repo.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        if not campaign.is_dm(requesting_user_id):
            raise ValueError("Only the DM can change member roles")

        role = CampaignRole.from_string(new_role)

        # A moderator runs the table rather than playing at it, so they cannot hold a
        # character in the party.
        if role == CampaignRole.MOD and self.character_repo:
            sessions = self.session_repo.get_by_campaign_id(campaign_id) if self.session_repo else []
            if sessions and self.character_repo.get_party_character(sessions[0].id, target_user_id):
                raise ValueError("A player with a character in the party cannot be a moderator")

        campaign.set_role(target_user_id, role)
        self.campaign_repo.save(campaign)

        # Broadcast silent state change to all members
        if self.event_manager:
            all_members = campaign.get_all_member_ids()
            events = CampaignEvents.campaign_role_changed(
                campaign_member_ids=all_members,
                acting_user_id=requesting_user_id,
                target_user_id=target_user_id,
                campaign_id=campaign_id,
                campaign_name=campaign.title,
                new_role=new_role,
            )
            for event_config in events:
                await self.event_manager.broadcast(event_config)

        return campaign
