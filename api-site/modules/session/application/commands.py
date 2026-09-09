# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Session commands — the campaign's table: who is at it and when it next meets.

Starting and ending games, and everything that moves state between PostgreSQL
and api-game, lives in modules/game: those are operations on a game, and used to
wear session names only because the session was carrying the game's status.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID
import logging

from sqlalchemy import update

from modules.session.repositories.session_repository import SessionRepository
from modules.session.model.session_model import SessionJoinedUser
from modules.session.domain.session_aggregate import SessionEntity
from modules.session.domain.session_events import SessionEvents
from modules.game.repositories.game_repository import GameRepository
from modules.user.repositories.user_repository import UserRepository
from modules.user.model.user_model import User
from modules.characters.repositories.character_repository import CharacterRepository
from modules.characters.domain.character_aggregate import CharacterAggregate
from modules.campaign.repositories.campaign_repository import CampaignRepository
from modules.events.event_manager import EventManager

logger = logging.getLogger(__name__)


class CreateSession:
    """Create the campaign's one session.

    Not reachable over HTTP: a campaign is born with its session and it is never
    replaced. There is no user-facing "create a game" — starting a game needs
    the session that already exists.
    """

    def __init__(
        self,
        session_repository: SessionRepository,
        campaign_repository: CampaignRepository,
        event_manager: EventManager
    ):
        self.session_repo = session_repository
        self.campaign_repo = campaign_repository
        self.event_manager = event_manager

    async def execute(
        self,
        campaign_id: UUID,
        host_id: UUID
    ) -> SessionEntity:
        """
        Create the campaign's session and enrol its members.

        Cross-aggregate coordination:
        - Creates Session aggregate
        - Updates Campaign to include session_id
        - Automatically enrols all campaign members in the new session

        Raises:
            ValueError: campaign missing, caller is not the host, or the campaign
                already has its session (the one-session invariant).
        """
        # Validate campaign exists and user is host
        campaign = self.campaign_repo.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        if not campaign.is_owned_by(host_id):
            raise ValueError("Only campaign host can create sessions")

        # The one-session invariant: a campaign has exactly one session for its
        # whole life. Any existing row means this call is a bug, not a user
        # error, so the message is for us.
        if campaign.session_ids:
            raise ValueError(
                f"Campaign {campaign_id} already has a session "
                f"({campaign.session_ids[0]}) — there is never a second"
            )

        # Create session aggregate (host_id auto-inherited from campaign)
        session = SessionEntity.create(campaign_id=campaign_id, host_id=host_id)

        # Automatically add all active campaign members to the session (bypass invite flow)
        # Campaign members already accepted at campaign level, no need for session-level acceptance
        for player_id in campaign.get_all_member_ids():
            try:
                # Add directly to joined_users (bypass invite acceptance)
                if player_id not in session.joined_users:
                    session.joined_users.append(player_id)
                    logger.info(f"Auto-added campaign player {player_id} to session {session.id}")
            except Exception as e:
                # Log but don't fail
                logger.warning(f"Could not auto-add player {player_id} to session {session.id}: {e}")

        # Save session first to get ID
        self.session_repo.save(session)

        # Validates the campaign's session limit. Not persisted: the link lives
        # on the session row's campaign_id.
        campaign.add_session(session.id)

        # Broadcast session_created event to all campaign members (silent state update)
        # Get host user for screen name
        host_user = self.campaign_repo.db.query(User).filter(User.id == host_id).first()

        # Broadcast to non-DM members
        non_dm_members = [uid for uid in campaign.get_all_member_ids() if uid != host_id]
        if non_dm_members:
            events = SessionEvents.session_created(
                non_dm_member_ids=non_dm_members,
                session_id=session.id,
                campaign_id=campaign_id,
                campaign_name=campaign.title,
                host_id=host_id,
                host_screen_name=host_user.screen_name if host_user else "Unknown"
            )

            # Broadcast to each campaign member
            for event_config in events:
                await self.event_manager.broadcast(event_config)

            logger.info(f"Broadcasting session_created event to {len(non_dm_members)} campaign members for session {session.id}")

        return session


class ScheduleSession:
    """Set or clear the plan for the campaign's next game: when, and what it is called."""

    def __init__(
        self,
        session_repository: SessionRepository,
        campaign_repository: CampaignRepository,
        user_repository: UserRepository,
        event_manager: EventManager,
        game_repository: GameRepository = None
    ):
        self.session_repo = session_repository
        self.campaign_repo = campaign_repository
        self.user_repo = user_repository
        self.event_manager = event_manager
        self.game_repo = game_repository

    async def execute(
        self,
        session_id: UUID,
        host_id: UUID,
        scheduled_at: Optional[datetime],
        next_game_name: Optional[str] = None
    ) -> SessionEntity:
        """Record the host's plan for the next game, or clear it with nulls.

        Cosmetic data: nothing is started, reminded or enforced by it. The date
        outlives its own moment on purpose — a past time is hidden by display
        rules rather than deleted, so the record of what was said survives. The
        name is taken by the next Start and belongs to that game from then on.

        Editable only while no game is running: changing "the next game" while
        this one is in progress would be describing a game that is happening.
        Liveness is a question about games, so it is asked here rather than on
        the aggregate.

        Raises:
            ValueError: session missing, caller is not the host, a game is
                running, the datetime is naive, or the name is too long.
        """
        session = self.session_repo.get_by_id(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        if session.host_id != host_id:
            raise ValueError("Only the host can schedule the game")

        if self.game_repo and self.game_repo.get_open_game_for_session(session_id):
            raise ValueError("End the game before changing the schedule")

        session.schedule(scheduled_at, next_game_name)
        self.session_repo.save(session)

        campaign = self.campaign_repo.get_by_id(session.campaign_id)
        if campaign:
            host_user = self.user_repo.get_by_id(host_id)
            events = SessionEvents.session_scheduled(
                campaign_member_ids=campaign.get_all_member_ids(),
                session_id=session.id,
                campaign_id=session.campaign_id,
                campaign_name=campaign.title,
                host_id=host_id,
                host_screen_name=(host_user.screen_name if host_user else None) or "Unknown",  # never email (PII)
                scheduled_at=scheduled_at,
                next_game_name=session.next_game_name
            )
            for event_config in events:
                await self.event_manager.broadcast(event_config)
            logger.info(
                f"Broadcast session_scheduled to {len(events)} recipient(s) for session {session.id}"
            )

        return session


class RemovePlayerFromSession:
    """Host removes a player from the session roster"""

    def __init__(
        self,
        session_repository: SessionRepository,
        character_repository: CharacterRepository
    ):
        self.session_repo = session_repository
        self.character_repo = character_repository

    def execute(
        self,
        session_id: UUID,
        user_id: UUID,
        removed_by: UUID
    ) -> SessionEntity:
        """
        Remove player from session roster.

        Note: Character locking is at CAMPAIGN level, not session level.
        Removing from session does NOT unlock the character from the campaign.
        """
        # Get session aggregate
        session = self.session_repo.get_by_id(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        # Verify remover is host
        if session.host_id != removed_by:
            raise ValueError("Only host can remove players")

        # Verify user is in joined roster
        if not session.has_user(user_id):
            raise ValueError("User is not in session roster")

        # Note: Character stays locked to campaign (not session-level unlocking)

        # Business logic in aggregate - remove user from joined_users
        session.remove_user(user_id)

        # Persist
        self.session_repo.save(session)

        return session


class SelectCharacterForSession:
    """
    DEPRECATED: Character selection is now at CAMPAIGN level.

    Use SelectCharacterForCampaign command in campaign module instead.
    This command now just updates the session roster display without locking.
    """

    def __init__(
        self,
        session_repository: SessionRepository,
        character_repository: CharacterRepository
    ):
        self.session_repo = session_repository
        self.character_repo = character_repository

    def execute(
        self,
        session_id: UUID,
        user_id: UUID,
        character_id: UUID
    ) -> CharacterAggregate:
        """
        DEPRECATED: Use campaign-level character selection instead.

        This now only updates session roster display - no locking.
        Character must already be locked to the campaign.
        """
        # Get session
        session = self.session_repo.get_by_id(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        # Verify user is in session roster
        if not session.has_user(user_id):
            raise ValueError("User has not joined this session")

        # Get character
        character = self.character_repo.get_by_id(character_id)
        if not character:
            raise ValueError(f"Character {character_id} not found")

        # Verify character ownership
        if not character.is_owned_by(user_id):
            raise ValueError("Character not owned by user")

        # Character must be locked to the campaign (not session)
        # This is a temporary compatibility layer - frontend should use campaign endpoint
        if not character.is_locked():
            raise ValueError("Character must be selected for the campaign first. Use campaign character selection.")

        if character.active_campaign != session.campaign_id:
            raise ValueError("Character is locked to a different campaign")

        # Update session_joined_users.selected_character_id for roster display only
        db_session = self.session_repo.db
        db_session.execute(
            update(SessionJoinedUser)
            .where(SessionJoinedUser.session_id == session_id)
            .where(SessionJoinedUser.user_id == user_id)
            .values(selected_character_id=character_id)
        )
        db_session.commit()

        return character
