# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from uuid import UUID
import httpx
import logging
import asyncio
from sqlalchemy import update

from modules.session.repositories.session_repository import SessionRepository
from modules.user.orm.user_repository import UserRepository
from modules.user.model.user_model import User
from modules.characters.orm.character_repository import CharacterRepository
from modules.characters.domain.character_aggregate import CharacterAggregate
from modules.campaign.orm.campaign_repository import CampaignRepository
from modules.campaign.model.session_model import SessionJoinedUser
from modules.session.domain.session_aggregate import SessionEntity, SessionStatus
from modules.events.event_manager import EventManager
from modules.session.domain.session_events import SessionEvents

logger = logging.getLogger(__name__)


class CreateSession:
    """Create a new session within a campaign"""

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
        name: str,
        campaign_id: UUID,
        host_id: UUID,
        max_players: int = 8
    ) -> SessionEntity:
        """
        Create a new session and add it to the campaign.

        Cross-aggregate coordination:
        - Creates Session aggregate
        - Updates Campaign to include session_id
        - Automatically invites all campaign players to the new session
        """
        # Validate campaign exists and user is host
        campaign = self.campaign_repo.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        if not campaign.is_owned_by(host_id):
            raise ValueError("Only campaign host can create sessions")

        # Business Rule: Only one session (INACTIVE/STARTING/ACTIVE/STOPPING) per campaign at a time
        existing_sessions = []
        for session_id in campaign.session_ids:
            existing_session = self.session_repo.get_by_id(session_id)
            # Check for INACTIVE, STARTING, ACTIVE, or STOPPING (exclude only FINISHED)
            if existing_session and existing_session.status in [
                SessionStatus.INACTIVE, SessionStatus.STARTING, SessionStatus.ACTIVE, SessionStatus.STOPPING
            ]:
                existing_sessions.append(existing_session.name)

        if existing_sessions:
            raise ValueError(
                f"Campaign already has a session: '{existing_sessions[0]}'. "
                f"Please finish or delete the existing session before creating a new one."
            )

        # Create session aggregate (host_id auto-inherited from campaign)
        session = SessionEntity.create(name=name, campaign_id=campaign_id, host_id=host_id, max_players=max_players)

        # Automatically add all campaign players to the session (bypass invite flow)
        # Campaign players already accepted at campaign level, no need for session-level acceptance
        for player_id in campaign.player_ids:
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

        # Add session reference to campaign
        campaign.add_session(session.id)
        self.campaign_repo.save(campaign)

        # Broadcast session_created event to all campaign members (silent state update)
        # Get host user for screen name
        host_user = self.campaign_repo.db.query(User).filter(User.id == host_id).first()

        # Only broadcast if there are campaign members (excludes host)
        if campaign.player_ids:
            events = SessionEvents.session_created(
                campaign_player_ids=[str(pid) for pid in campaign.player_ids],
                session_id=str(session.id),
                session_name=session.name,
                campaign_id=str(campaign_id),
                campaign_name=campaign.title,
                host_id=str(host_id),
                host_screen_name=host_user.screen_name if host_user else "Unknown"
            )

            # Broadcast to each campaign member
            for event_config in events:
                await self.event_manager.broadcast(**event_config)

            logger.info(f"Broadcasting session_created event to {len(campaign.player_ids)} campaign members for session {session.id}")

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

        Unlocks their character and removes them from joined_users.
        Only host can remove players.
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

        # Find and unlock character (if any) locked to this session
        # User's characters locked to this session
        user_characters = self.character_repo.get_by_user_id(user_id)
        for character in user_characters:
            if character.active_session == session_id:
                character.unlock_from_session()
                self.character_repo.save(character)
                break

        # Business logic in aggregate - remove user from joined_users
        session.remove_user(user_id)

        # Persist
        self.session_repo.save(session)

        return session


class UpdateSession:
    """Update session details"""

    def __init__(self, session_repository: SessionRepository):
        self.session_repo = session_repository

    def execute(
        self,
        session_id: UUID,
        host_id: UUID,
        name: str = None
    ) -> SessionEntity:
        """Update session details (only host can update)"""
        session = self.session_repo.get_by_id(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        if session.host_id != host_id:
            raise ValueError("Only host can update session details")

        if name is not None:
            session.update_name(name)

        self.session_repo.save(session)
        return session


class DeleteSession:
    """Delete a session"""

    def __init__(
        self,
        session_repository: SessionRepository,
        campaign_repository: CampaignRepository
    ):
        self.session_repo = session_repository
        self.campaign_repo = campaign_repository

    def execute(
        self,
        session_id: UUID,
        host_id: UUID
    ) -> bool:
        """
        Delete session and remove from campaign.

        Cross-aggregate coordination:
        - Deletes Session aggregate
        - Updates Campaign to remove session_id
        """
        session = self.session_repo.get_by_id(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        if session.host_id != host_id:
            raise ValueError("Only host can delete session")

        # Get campaign to update
        campaign = self.campaign_repo.get_by_id(session.campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {session.campaign_id} not found")

        # Delete session (repository validates business rules)
        self.session_repo.delete(session_id)

        # Remove session reference from campaign
        campaign.remove_session(session_id)
        self.campaign_repo.save(campaign)

        return True


class StartSession:
    """
    Start session: INACTIVE → STARTING → ACTIVE (synchronous).
    Creates MongoDB active_session via api-game service.
    """

    def __init__(
        self,
        session_repository: SessionRepository,
        user_repository: UserRepository,
        campaign_repository: CampaignRepository,
        event_manager: EventManager
    ):
        self.session_repo = session_repository
        self.user_repo = user_repository
        self.campaign_repo = campaign_repository
        self.event_manager = event_manager

    async def execute(self, session_id: UUID, host_id: UUID) -> SessionEntity:
        """
        Start a session.

        Flow:
        1. Validates session ownership and status
        2. Sets session status to STARTING
        3. Calls api-game to create MongoDB active_session
        4. Sets session status to ACTIVE with active_game_id

        Raises:
            ValueError: If validation fails or api-game call fails
        """
        # 1. Load session
        session = self.session_repo.get_by_id(session_id)
        if not session:
            raise ValueError("Session not found")

        # 2. Validate host ownership
        if session.host_id != host_id:
            raise ValueError("Only the host can start this session")

        # 3. Validate session status
        if session.status != SessionStatus.INACTIVE:
            raise ValueError(f"Cannot start session in {session.status} status")

        # 4. Business Rule: Only one session (INACTIVE/STARTING/ACTIVE/STOPPING) per campaign at a time
        campaign = self.campaign_repo.get_by_id(session.campaign_id)
        if campaign:
            active_sessions = []
            for sid in campaign.session_ids:
                existing_session = self.session_repo.get_by_id(sid)
                # Check for INACTIVE, STARTING, ACTIVE, or STOPPING (exclude only FINISHED)
                if existing_session and existing_session.id != session.id and existing_session.status in [
                    SessionStatus.INACTIVE, SessionStatus.STARTING, SessionStatus.ACTIVE, SessionStatus.STOPPING
                ]:
                    active_sessions.append(existing_session.name)

            if active_sessions:
                raise ValueError(
                    f"Campaign already has an active or paused session: '{active_sessions[0]}'. "
                    f"Please finish or delete the existing session before starting a new one."
                )

        # 5. Set STARTING status
        session.start()  # Domain method sets status = STARTING
        self.session_repo.save(session)
        logger.info(f"Session {session_id} status set to STARTING")

        # 5. Get host user
        host_user = self.user_repo.get_by_id(host_id)
        if not host_user:
            # Rollback
            session.status = SessionStatus.INACTIVE
            self.session_repo.save(session)
            raise ValueError("Host user not found")

        # Use screen_name if set, otherwise email
        dm_username = host_user.screen_name or host_user.email

        # 6. Build payload for api-game
        payload = {
            "session_id": str(session.id),
            "dm_username": dm_username,
            "max_players": session.max_players,  # From session aggregate
            "joined_user_ids": [str(user_id) for user_id in session.joined_users]  # Campaign players
        }

        # 7. Call api-game (synchronous await)
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "http://api-game:8081/game/session/start",
                    json=payload,
                    timeout=10.0
                )

            if response.status_code != 200:
                error_detail = response.text
                logger.error(f"api-game error {response.status_code}: {error_detail}")

                # Rollback to INACTIVE
                session.status = SessionStatus.INACTIVE
                self.session_repo.save(session)
                raise ValueError(f"Failed to create game: {error_detail}")

            # 8. Parse response
            result = response.json()
            active_game_id = result["session_id"]  # MongoDB ObjectID

            # 9. Mark ACTIVE and store active_game_id
            session.activate()  # Sets ACTIVE, started_at = now
            session.active_game_id = active_game_id
            self.session_repo.save(session)

            logger.info(f"Session {session_id} ACTIVE with game {active_game_id}")

            # 10. Broadcast session_started event to all campaign members + DM (with notification)
            campaign = self.campaign_repo.get_by_id(session.campaign_id)
            if campaign:
                # Include DM in recipient list (DM gets confirmation toast)
                all_recipients = list(campaign.player_ids) + [campaign.host_id]

                events = SessionEvents.session_started(
                    campaign_player_ids=all_recipients,
                    session_id=session.id,
                    session_name=session.name,
                    campaign_id=session.campaign_id,
                    active_game_id=active_game_id,
                    dm_id=host_id,
                    dm_screen_name=host_user.screen_name if host_user.screen_name else host_user.email
                )

                # Broadcast to each recipient
                for event_config in events:
                    await self.event_manager.broadcast(**event_config)

                logger.info(f"Broadcasting session_started event to {len(all_recipients)} recipients for session {session.id}")

            return session

        except httpx.RequestError as e:
            # Network error calling api-game
            logger.error(f"Network error calling api-game: {e}")

            # Rollback to INACTIVE
            session.status = SessionStatus.INACTIVE
            self.session_repo.save(session)
            raise ValueError(f"Cannot reach game service: {str(e)}")


class PauseSession:
    """
    Pause session: ACTIVE → STOPPING → INACTIVE (three-phase fail-safe).

    Three-phase pattern ensures data preservation:
    1. Fetch final state from MongoDB (non-destructive)
    2. Write to PostgreSQL (with transaction)
    3. Delete MongoDB session (background cleanup)
    """

    def __init__(
        self,
        session_repository: SessionRepository,
        user_repository: UserRepository,
        character_repository,
        campaign_repository: CampaignRepository,
        event_manager: EventManager
    ):
        self.session_repo = session_repository
        self.user_repo = user_repository
        self.character_repo = character_repository
        self.campaign_repo = campaign_repository
        self.event_manager = event_manager

    async def execute(self, session_id: UUID, host_id: UUID) -> SessionEntity:
        """
        Pause a session using fail-safe three-phase pattern.

        Flow:
        1. Validates session ownership and status
        2. Sets session status to STOPPING
        3. PHASE 1: Fetch final state from MongoDB (validate_only=True, non-destructive)
        4. PHASE 2: Write to PostgreSQL (with transaction, fail-safe)
        5. PHASE 3: Background cleanup of MongoDB session (fire-and-forget)

        Raises:
            ValueError: If validation fails or api-game call fails
        """
        # 1. Load and validate session
        session = self.session_repo.get_by_id(session_id)
        if not session:
            raise ValueError("Session not found")

        # 2. Validate host ownership
        if session.host_id != host_id:
            raise ValueError("Only the host can pause this session")

        # 3. Validate session status
        if session.status != SessionStatus.ACTIVE:
            raise ValueError(f"Cannot pause session in {session.status} status")

        # 4. Set STOPPING status
        session.pause()  # Domain method sets status = STOPPING
        self.session_repo.save(session)
        logger.info(f"Session {session_id} status set to STOPPING")

        # 5. PHASE 1: Fetch final state (MongoDB NOT deleted yet)
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "http://api-game:8081/game/session/end",
                    params={"validate_only": True},
                    json={"session_id": str(session_id)},
                    timeout=10.0
                )

            if response.status_code != 200:
                # Can't fetch state - rollback to ACTIVE
                logger.error(f"Failed to fetch final state: {response.text}")
                session.status = SessionStatus.ACTIVE
                self.session_repo.save(session)
                raise ValueError(f"Cannot fetch game state: {response.text}")

            final_state = response.json()["final_state"]
            logger.info(f"✅ Fetched final state for {session_id}: {len(final_state.get('players', []))} players")

            # Extract max_players from MongoDB session stats
            max_players_from_session = final_state.get("session_stats", {}).get("max_players", session.max_players)
            logger.info(f"📊 Session max_players: {max_players_from_session} (original: {session.max_players})")

        except httpx.RequestError as e:
            # Network error - rollback to ACTIVE
            logger.error(f"Network error fetching state: {e}")
            session.status = SessionStatus.ACTIVE
            self.session_repo.save(session)
            raise ValueError(f"Cannot reach game service: {str(e)}")

        # 6. PHASE 2: Write to PostgreSQL (with implicit transaction via repository)
        try:
            # Capture active_game_id BEFORE deactivate clears it
            active_game_id_to_cleanup = session.active_game_id

            # Update max_players from MongoDB session (if changed during session)
            session.max_players = max_players_from_session

            # Mark session INACTIVE (this will clear session.active_game_id to None)
            session.deactivate()  # Sets INACTIVE, stopped_at = now, active_game_id = None
            self.session_repo.save(session)
            logger.info(f"✅ Session {session_id} marked INACTIVE in PostgreSQL with max_players={max_players_from_session}")

            # Unlock all characters that were locked to this session
            locked_characters = self.character_repo.get_by_active_session(session_id)
            for character in locked_characters:
                character.unlock_from_session()
                self.character_repo.save(character)
            logger.info(f"✅ Unlocked {len(locked_characters)} character(s) from session {session_id}")

        except Exception as pg_error:
            # PostgreSQL write failed - MongoDB session is PRESERVED
            logger.error(f"❌ PostgreSQL write failed for {session_id}: {pg_error}")
            logger.error(f"⚠️ MongoDB session {session.active_game_id} PRESERVED for manual retry")

            # Leave session in STOPPING status so user knows there's an issue
            # They can retry the pause session operation
            raise ValueError(
                f"Failed to save session data. Game preserved in MongoDB. "
                f"Please try pausing the session again. Error: {str(pg_error)}"
            )

        # 7. Broadcast session_paused event to all campaign members (silent state update)
        campaign = self.campaign_repo.get_by_id(session.campaign_id)
        if campaign:
            # Get host user for screen name
            host_user = self.user_repo.get_by_id(host_id)

            # Include DM + all campaign members as recipients
            all_recipients = list(campaign.player_ids) + [campaign.host_id]

            events = SessionEvents.session_paused(
                active_participant_ids=all_recipients,
                session_id=session.id,
                session_name=session.name,
                campaign_id=session.campaign_id,
                paused_by_id=host_id,
                paused_by_screen_name=host_user.screen_name if host_user and host_user.screen_name else (host_user.email if host_user else "Unknown")
            )

            # Broadcast to each recipient
            for event_config in events:
                await self.event_manager.broadcast(**event_config)

            logger.info(f"Broadcasting session_paused event to {len(all_recipients)} recipients for session {session.id}")

        # 8. PHASE 3: Background cleanup (fire-and-forget)
        # This doesn't block the response - cleanup happens in background
        # Use captured active_game_id, not session.active_game_id (which is now None)
        asyncio.create_task(self._async_cleanup(session_id, active_game_id_to_cleanup))

        logger.info(f"✅ Session {session_id} paused successfully, cleanup scheduled")
        return session

    async def _async_cleanup(self, session_id: UUID, active_game_id: str):
        """
        Background task to delete MongoDB session.

        Doesn't block the response. If this fails, the hourly cron job
        will clean up orphaned sessions (sessions with status=INACTIVE and active_game_id set).
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.delete(
                    f"http://api-game:8081/game/session/{active_game_id}",
                    params={"keep_logs": False},  # Delete adventure logs - no cross-session persistence
                    timeout=5.0
                )

            if response.status_code == 200:
                # Success - clear active_game_id from PostgreSQL
                session = self.session_repo.get_by_id(session_id)
                if session:
                    session.active_game_id = None
                    self.session_repo.save(session)
                    logger.info(f"✅ Background cleanup complete for {session_id}")
            else:
                logger.warning(f"⚠️ MongoDB cleanup failed for {session_id}: {response.text}")
                logger.warning(f"Cron job will clean up game {active_game_id}")

        except Exception as e:
            # Cleanup failed - cron will handle it
            logger.warning(f"⚠️ Background cleanup failed for {session_id}: {e}")
            logger.warning(f"Cron job will clean up game {active_game_id}")


class FinishSession:
    """
    Finish session permanently: ACTIVE/INACTIVE → FINISHED.
    Performs full ETL if session is ACTIVE, then marks as FINISHED.
    FINISHED sessions cannot be resumed and are preserved in campaign history.
    """

    def __init__(
        self,
        session_repository: SessionRepository,
        user_repository: UserRepository,
        character_repository: CharacterRepository,
        campaign_repository: CampaignRepository,
        event_manager: EventManager
    ):
        self.session_repo = session_repository
        self.user_repo = user_repository
        self.character_repo = character_repository
        self.campaign_repo = campaign_repository
        self.event_manager = event_manager

    async def execute(self, session_id: UUID, host_id: UUID) -> SessionEntity:
        """
        Finish a session permanently.

        Flow:
        - If ACTIVE: Performs full ETL (like PauseSession) then sets FINISHED
        - If INACTIVE: Sets FINISHED directly

        Session will be marked FINISHED and cannot be resumed.

        Raises:
            ValueError: If validation fails or api-game call fails
        """
        # 1. Load session
        session = self.session_repo.get_by_id(session_id)
        if not session:
            raise ValueError("Session not found")

        # 2. Validate host ownership
        if session.host_id != host_id:
            raise ValueError("Only the host can finish this session")

        # 3. If session is INACTIVE, just mark as FINISHED
        if session.status == SessionStatus.INACTIVE:
            session.finish()  # Domain method sets status = FINISHED
            self.session_repo.save(session)
            logger.info(f"Session {session_id} marked FINISHED (was INACTIVE)")

            # Broadcast session_finished event to all campaign members (silent state update)
            campaign = self.campaign_repo.get_by_id(session.campaign_id)
            if campaign:
                # All campaign members (including host)
                all_recipients = list(campaign.player_ids) + [campaign.host_id]

                events = SessionEvents.session_finished(
                    dm_id=campaign.host_id,
                    participant_ids=campaign.player_ids,
                    session_id=session.id,
                    session_name=session.name,
                    campaign_id=session.campaign_id
                )

                # Broadcast to each recipient
                for event_config in events:
                    await self.event_manager.broadcast(**event_config)

                logger.info(f"Broadcasting session_finished event to {len(all_recipients)} recipients for session {session.id}")

            return session

        # 4. If session is ACTIVE, perform ETL then mark as FINISHED
        if session.status != SessionStatus.ACTIVE:
            raise ValueError(f"Cannot finish session in {session.status} status. Only ACTIVE or INACTIVE sessions can be finished.")

        # 5. Set STOPPING status (ETL process starting)
        session.finish_from_active()  # Domain method sets status = STOPPING
        self.session_repo.save(session)
        logger.info(f"Session {session_id} status set to STOPPING (finishing)")

        # 6. PHASE 1: Fetch final state (MongoDB NOT deleted yet)
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "http://api-game:8081/game/session/end",
                    params={"validate_only": True},
                    json={"session_id": str(session_id)},
                    timeout=10.0
                )

            if response.status_code != 200:
                # Can't fetch state - rollback to ACTIVE
                logger.error(f"Failed to fetch final state: {response.text}")
                session.status = SessionStatus.ACTIVE
                self.session_repo.save(session)
                raise ValueError(f"Cannot fetch game state: {response.text}")

            final_state = response.json()["final_state"]
            logger.info(f"✅ Fetched final state for {session_id}: {len(final_state.get('players', []))} players")

            # Extract max_players from MongoDB session stats
            max_players_from_session = final_state.get("session_stats", {}).get("max_players", session.max_players)
            logger.info(f"📊 Session max_players: {max_players_from_session} (original: {session.max_players})")

        except httpx.RequestError as e:
            # Network error - rollback to ACTIVE
            logger.error(f"Network error fetching state: {e}")
            session.status = SessionStatus.ACTIVE
            self.session_repo.save(session)
            raise ValueError(f"Cannot reach game service: {str(e)}")

        # 7. PHASE 2: Write to PostgreSQL and mark as FINISHED
        try:
            # Capture active_game_id BEFORE mark_finished clears it
            active_game_id_to_cleanup = session.active_game_id

            # Update max_players from MongoDB session (if changed during session)
            session.max_players = max_players_from_session

            # Mark session FINISHED (this will clear session.active_game_id to None)
            session.mark_finished()  # Sets FINISHED, stopped_at = now, active_game_id = None
            self.session_repo.save(session)
            logger.info(f"✅ Session {session_id} marked FINISHED in PostgreSQL with max_players={max_players_from_session}")

            # Unlock all characters that were locked to this session
            locked_characters = self.character_repo.get_by_active_session(session_id)
            for character in locked_characters:
                character.unlock_from_session()
                self.character_repo.save(character)
            logger.info(f"✅ Unlocked {len(locked_characters)} character(s) from session {session_id}")

        except Exception as pg_error:
            # PostgreSQL write failed - MongoDB session is PRESERVED
            logger.error(f"❌ PostgreSQL write failed for {session_id}: {pg_error}")
            logger.error(f"⚠️ MongoDB session {session.active_game_id} PRESERVED for manual retry")

            # Leave session in STOPPING status so user knows there's an issue
            raise ValueError(
                f"Failed to save session data. Game preserved in MongoDB. "
                f"Please try finishing the session again. Error: {str(pg_error)}"
            )

        # 8. PHASE 3: Background cleanup (fire-and-forget)
        asyncio.create_task(self._async_cleanup(session_id, active_game_id_to_cleanup))

        logger.info(f"✅ Session {session_id} finished successfully, cleanup scheduled")

        # 9. Broadcast session_finished event to all campaign members (silent state update)
        campaign = self.campaign_repo.get_by_id(session.campaign_id)
        if campaign:
            # All campaign members (including host)
            all_recipients = list(campaign.player_ids) + [campaign.host_id]

            events = SessionEvents.session_finished(
                dm_id=campaign.host_id,
                participant_ids=campaign.player_ids,
                session_id=session.id,
                session_name=session.name,
                campaign_id=session.campaign_id
            )

            # Broadcast to each recipient
            for event_config in events:
                await self.event_manager.broadcast(**event_config)

            logger.info(f"Broadcasting session_finished event to {len(all_recipients)} recipients for session {session.id}")

        return session

    async def _async_cleanup(self, session_id: UUID, active_game_id: str):
        """
        Background task to delete MongoDB session.
        Same as PauseSession cleanup.
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.delete(
                    f"http://api-game:8081/game/session/{active_game_id}",
                    params={"keep_logs": False},
                    timeout=5.0
                )

            if response.status_code == 200:
                logger.info(f"✅ Background cleanup successful for {session_id}")
            else:
                logger.warning(f"⚠️ Background cleanup failed: {response.text}")

        except Exception as e:
            # Cleanup failed - cron will handle it
            logger.warning(f"⚠️ Background cleanup failed for {session_id}: {e}")
            logger.warning(f"Cron job will clean up game {active_game_id}")


class SelectCharacterForSession:
    """User selects a character for a joined session"""

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
        Select character for a session.

        Business rules:
        - User must be in joined_users (session roster)
        - Character must be owned by user
        - Character must not be locked to another session
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

        # Verify character not locked to another session
        if character.is_locked():
            raise ValueError(f"Character already locked to session {character.active_session}")

        # Lock character to session
        character.lock_to_session(session_id)
        self.character_repo.save(character)

        # Update session_joined_users.selected_character_id for roster display
        db_session = self.session_repo.db
        db_session.execute(
            update(SessionJoinedUser)
            .where(SessionJoinedUser.session_id == session_id)
            .where(SessionJoinedUser.user_id == user_id)
            .values(selected_character_id=character_id)
        )
        db_session.commit()

        return character


class ChangeCharacterForSession:
    """User changes their character for a session (between play sessions)"""

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
        old_character_id: UUID,
        new_character_id: UUID
    ) -> CharacterAggregate:
        """
        Change character for a session.

        Business rules:
        - User must be in joined_users (session roster)
        - Old character must be owned by user and locked to this session
        - New character must be owned by user and not locked
        - Old character must NOT be in active game (check via is_alive or other means)
        """
        # Get session
        session = self.session_repo.get_by_id(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        # Verify user is in session roster
        if not session.has_user(user_id):
            raise ValueError("User has not joined this session")

        # Get old character
        old_character = self.character_repo.get_by_id(old_character_id)
        if not old_character:
            raise ValueError(f"Old character {old_character_id} not found")

        # Verify old character ownership and lock
        if not old_character.is_owned_by(user_id):
            raise ValueError("Old character not owned by user")

        if old_character.active_session != session_id:
            raise ValueError("Old character not locked to this session")

        # TODO: Verify old character not in active game (would need MongoDB check)
        # For now, we'll trust the frontend to enforce this rule

        # Get new character
        new_character = self.character_repo.get_by_id(new_character_id)
        if not new_character:
            raise ValueError(f"New character {new_character_id} not found")

        # Verify new character ownership
        if not new_character.is_owned_by(user_id):
            raise ValueError("New character not owned by user")

        # Verify new character not locked
        if new_character.is_locked():
            raise ValueError(f"New character already locked to session {new_character.active_session}")

        # Unlock old character
        old_character.unlock_from_session()
        self.character_repo.save(old_character)

        # Lock new character
        new_character.lock_to_session(session_id)
        self.character_repo.save(new_character)

        # Update session_joined_users.selected_character_id for roster display
        db_session = self.session_repo.db
        db_session.execute(
            update(SessionJoinedUser)
            .where(SessionJoinedUser.session_id == session_id)
            .where(SessionJoinedUser.user_id == user_id)
            .values(selected_character_id=new_character_id)
        )
        db_session.commit()

        return new_character


class ChangeCharacterDuringGame:
    """User changes their character during an active game"""

    def __init__(
        self,
        session_repository: SessionRepository,
        character_repository: CharacterRepository,
        user_repository: UserRepository
    ):
        self.session_repo = session_repository
        self.character_repo = character_repository
        self.user_repo = user_repository

    async def execute(
        self,
        session_id: UUID,
        user_id: UUID,
        new_character_id: UUID
    ) -> CharacterAggregate:
        """
        Change character during an active game.

        Business rules:
        - Session must be ACTIVE
        - User must be in joined_users (session roster)
        - New character must be owned by user
        - New character must not be locked to another session (can be locked to this session or free)

        Note: Old character stays locked (accumulating locks approach).
        All locked characters are unlocked at session pause/finish via PauseSession/FinishSession command.
        """
        # Get session
        session = self.session_repo.get_by_id(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        # Verify session is ACTIVE
        if session.status != SessionStatus.ACTIVE:
            raise ValueError("Can only change character during active game")

        # Verify user is in session roster
        if not session.has_user(user_id):
            raise ValueError("User has not joined this session")

        # Get user for player name
        user = self.user_repo.get_by_id(user_id)
        if not user:
            raise ValueError(f"User {user_id} not found")

        player_name = user.screen_name or user.email

        # Get new character
        new_character = self.character_repo.get_by_id(new_character_id)
        if not new_character:
            raise ValueError(f"Character {new_character_id} not found")

        # Verify new character ownership
        if not new_character.is_owned_by(user_id):
            raise ValueError("Character not owned by user")

        # Verify new character is not locked to a different session
        if new_character.is_locked() and new_character.active_session != session_id:
            raise ValueError(f"Character already locked to another session {new_character.active_session}")

        # Lock new character to session (if not already locked to this session)
        if not new_character.is_locked():
            new_character.lock_to_session(session_id)
            self.character_repo.save(new_character)

        # Update session_joined_users.selected_character_id for roster display
        db_session = self.session_repo.db
        db_session.execute(
            update(SessionJoinedUser)
            .where(SessionJoinedUser.session_id == session_id)
            .where(SessionJoinedUser.user_id == user_id)
            .values(selected_character_id=new_character_id)
        )
        db_session.commit()

        # Call api-game to update MongoDB seat with new character data
        character_data = {
            "player_name": player_name,
            "user_id": str(user_id),
            "character_id": str(new_character.id),
            "character_name": new_character.character_name,
            "character_class": new_character.character_class,
            "character_race": new_character.character_race,
            "level": new_character.level,
            "hp_current": new_character.hp_current,
            "hp_max": new_character.hp_max,
            "ac": new_character.ac
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.put(
                    f"http://api-game:8081/game/{session.active_game_id}/player/character",
                    json=character_data,
                    timeout=10.0
                )

            if response.status_code != 200:
                logger.error(f"api-game character update failed: {response.text}")
                # PostgreSQL is already updated, log the desync but don't rollback
                # The player can re-enter the game to resync
                logger.warning(f"MongoDB desync for player {player_name} in game {session.active_game_id}")

        except httpx.RequestError as e:
            logger.error(f"Network error updating character in api-game: {e}")
            # Same - don't rollback PostgreSQL, just log

        logger.info(f"Character changed to {new_character.character_name} for user {user_id} in session {session_id}")
        return new_character


class DisconnectFromGame:
    """Handle player disconnect from active game (partial ETL)"""

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
        character_id: UUID,
        character_state: dict
    ) -> CharacterAggregate:
        """
        Save character state when player disconnects from active game.

        Partial ETL - updates ONLY the character's state from MongoDB to PostgreSQL.

        Business rules:
        - Session must be ACTIVE
        - Character must be owned by user
        - Character must be locked to this session

        character_state structure:
        {
            "current_hp": int,
            "current_position": {"x": int, "y": int},
            "status_effects": [...],
            ... other game-specific state
        }
        """
        # Get session
        session = self.session_repo.get_by_id(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        # Verify session is active
        if not session.is_active():
            raise ValueError("Session is not active")

        # Get character
        character = self.character_repo.get_by_id(character_id)
        if not character:
            raise ValueError(f"Character {character_id} not found")

        # Verify character ownership
        if not character.is_owned_by(user_id):
            raise ValueError("Character not owned by user")

        # Verify character is locked to this session
        if character.active_session != session_id:
            raise ValueError("Character not locked to this session")

        # Update character state from MongoDB
        if "current_hp" in character_state:
            character.hp_current = character_state["current_hp"]

        # Mark character dead if HP reached 0
        if character.hp_current <= 0 and character.is_alive:
            character.mark_dead()

        # TODO: Add position tracking and other state fields when implemented
        # character.position = character_state.get("current_position")
        # character.status_effects = character_state.get("status_effects", [])

        # Save character (partial ETL complete)
        self.character_repo.save(character)

        logger.info(f"Partial ETL complete for character {character_id} in session {session_id}")

        return character
