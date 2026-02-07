# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from uuid import UUID
import httpx
import logging
import asyncio
import os
from concurrent.futures import ThreadPoolExecutor
from sqlalchemy import update

from modules.session.repositories.session_repository import SessionRepository
from modules.user.orm.user_repository import UserRepository
from modules.user.model.user_model import User
from modules.characters.orm.character_repository import CharacterRepository
from modules.characters.domain.character_aggregate import CharacterAggregate
from modules.campaign.orm.campaign_repository import CampaignRepository
from modules.campaign.model.session_model import SessionJoinedUser
from modules.session.domain.session_aggregate import SessionEntity, SessionStatus
from modules.library.repositories.asset_repository import MediaAssetRepository
from modules.library.domain.map_asset_aggregate import MapAsset
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
        event_manager: EventManager,
        asset_repository: MediaAssetRepository = None,
        s3_service = None  # For presigned URL generation
    ):
        self.session_repo = session_repository
        self.user_repo = user_repository
        self.campaign_repo = campaign_repository
        self.event_manager = event_manager
        self.asset_repo = asset_repository
        self.s3_service = s3_service

    async def _generate_presigned_urls_parallel(self, assets):
        """
        Generate presigned URLs for all assets in parallel using ThreadPoolExecutor.

        URL generation is CPU-bound (HMAC-SHA256 signing), so we scale workers
        to available CPU cores for optimal performance.

        Uses the configured PRESIGNED_URL_EXPIRY from settings (via S3Service).

        Args:
            assets: List of asset objects with s3_key attribute

        Returns:
            Dict mapping s3_key -> presigned_url
        """
        if not self.s3_service or not assets:
            return {}

        def generate_url(s3_key):
            try:
                # Uses expiry from settings.PRESIGNED_URL_EXPIRY (S3Service default)
                url = self.s3_service.generate_download_url(s3_key)
                return (s3_key, url)
            except Exception as e:
                logger.warning(f"Failed to generate URL for {s3_key}: {e}")
                return (s3_key, None)

        # Scale workers to CPU count (CPU-bound crypto work)
        # Minimum 2, maximum capped at asset count to avoid idle threads
        cpu_count = os.cpu_count() or 2
        max_workers = min(len(assets), cpu_count * 2)  # 2x cores for slight I/O slack

        loop = asyncio.get_event_loop()
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            s3_keys = [asset.s3_key for asset in assets]
            futures = [loop.run_in_executor(executor, generate_url, key) for key in s3_keys]
            results = await asyncio.gather(*futures)

        successful = {key: url for key, url in results if url is not None}
        logger.info(f"Generated {len(successful)}/{len(assets)} presigned URLs with {max_workers} workers on {cpu_count} CPUs")
        return successful

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

        # Wrap everything after STARTING in try/catch to ensure rollback on ANY error
        try:
            # 6. Get host user
            host_user = self.user_repo.get_by_id(host_id)
            if not host_user:
                raise ValueError("Host user not found")

            # Use screen_name if set, otherwise email
            dm_username = host_user.screen_name or host_user.email

            # 7. Fetch campaign assets and generate fresh presigned URLs
            assets = []
            asset_url_lookup = {}
            if self.asset_repo:
                campaign_assets = self.asset_repo.get_by_campaign_id(session.campaign_id)

                # Generate presigned URLs in parallel (CPU-bound HMAC signing)
                url_map = await self._generate_presigned_urls_parallel(campaign_assets)

                assets = [
                    {
                        "id": str(asset.id),
                        "filename": asset.filename,
                        "s3_key": asset.s3_key,
                        # Convert enum to string for api-game JSON payload
                        "asset_type": asset.asset_type.value if hasattr(asset.asset_type, 'value') else str(asset.asset_type),
                        # Fresh presigned URL
                        "s3_url": url_map.get(asset.s3_key)
                    }
                    for asset in campaign_assets
                ]
                logger.info(f"Found {len(assets)} assets for campaign {session.campaign_id} with {len(url_map)} fresh URLs")

                # Build asset_id → presigned_url lookup from freshly generated URLs
                asset_url_lookup = {a["id"]: a["s3_url"] for a in assets if a.get("s3_url")}

            # UX delay: Show "Starting" animation to users
            await asyncio.sleep(2)

            # 8. Build payload for api-game
            # Restore audio config from previous session with fresh presigned URLs
            audio_config_with_urls = {}
            if session.audio_config:
                for channel_id, ch in session.audio_config.items():
                    audio_config_with_urls[channel_id] = {
                        **ch,
                        "s3_url": asset_url_lookup.get(ch.get("asset_id")),
                        "playback_state": "stopped",
                        "started_at": None,
                        "paused_elapsed": None,
                    }
                logger.info(f"Restoring audio config: {len(audio_config_with_urls)} channels from previous session")

            # Restore map config from previous session with fresh presigned URL
            map_config_with_url = {}
            if session.map_config and session.map_config.get("asset_id"):
                map_asset_id = session.map_config["asset_id"]
                fresh_url = asset_url_lookup.get(map_asset_id)

                if fresh_url:
                    # Fetch asset from repository to get filename
                    map_asset = self.asset_repo.get_by_id(UUID(map_asset_id))

                    if map_asset:
                        # Use stored grid_config from session (persisted during pause/finish)
                        # TODO: Once MapAsset domain is implemented, prefer MapAsset.get_grid_config()
                        stored_grid_config = session.map_config.get("grid_config")
                        map_config_with_url = {
                            "asset_id": map_asset_id,
                            "filename": map_asset.filename,
                            "original_filename": map_asset.filename,
                            "file_path": fresh_url,
                            "grid_config": stored_grid_config
                        }
                        logger.info(f"Restoring map: {map_asset.filename} with grid {stored_grid_config}")
                    else:
                        logger.warning(f"Cannot restore map: asset {map_asset_id} not found")
                else:
                    logger.warning(f"Cannot restore map: asset {map_asset_id} not in campaign assets")

            payload = {
                "session_id": str(session.id),
                "campaign_id": str(session.campaign_id),  # For api-game to proxy asset requests to api-site
                "dm_username": dm_username,
                "max_players": session.max_players,  # From session aggregate
                "joined_user_ids": [str(user_id) for user_id in session.joined_users],  # Campaign players
                "assets": assets,  # Campaign library assets (legacy, api-game will fetch fresh URLs on-demand)
                "audio_config": audio_config_with_urls,
                "map_config": map_config_with_url
            }

            # 9. Call api-game (synchronous await)
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "http://api-game:8081/game/session/start",
                    json=payload,
                    timeout=10.0
                )

            if response.status_code != 200:
                error_detail = response.text
                logger.error(f"api-game error {response.status_code}: {error_detail}")
                raise ValueError(f"Failed to create game: {error_detail}")

            # 10. Parse response
            result = response.json()
            active_game_id = result["session_id"]  # MongoDB ObjectID

            # 11. Mark ACTIVE and store active_game_id
            session.activate()  # Sets ACTIVE, started_at = now
            session.active_game_id = active_game_id
            self.session_repo.save(session)

            logger.info(f"Session {session_id} ACTIVE with game {active_game_id}")

            # 12. Broadcast session_started event to all campaign members + DM (with notification)
            campaign = self.campaign_repo.get_by_id(session.campaign_id)
            if campaign:
                # Include DM in recipient list (DM gets confirmation toast)
                all_recipients = list(campaign.player_ids) + [campaign.host_id]

                events = SessionEvents.session_started(
                    campaign_player_ids=all_recipients,
                    session_id=session.id,
                    session_name=session.name,
                    campaign_id=session.campaign_id,
                    campaign_name=campaign.title,
                    active_game_id=active_game_id,
                    host_id=host_id,
                    host_screen_name=host_user.screen_name if host_user.screen_name else host_user.email
                )

                # Broadcast to each recipient
                for event_config in events:
                    await self.event_manager.broadcast(**event_config)

                logger.info(f"Broadcasting session_started event to {len(all_recipients)} recipients for session {session.id}")

            return session

        except Exception as e:
            # ANY error after STARTING should rollback to INACTIVE
            logger.error(f"Unexpected error starting session {session_id}: {e}")
            session.abort_start()  # Domain method: STARTING → INACTIVE
            self.session_repo.save(session)
            logger.info(f"Session {session_id} rolled back to INACTIVE after error")
            raise ValueError(f"Failed to start session: {str(e)}")


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
                raise ValueError(f"Cannot fetch game state: {response.text}")

            final_state = response.json()["final_state"]
            logger.info(f"Fetched final state for {session_id}: {len(final_state.get('players', []))} players")

            # Extract max_players from MongoDB session stats
            max_players_from_session = final_state.get("session_stats", {}).get("max_players", session.max_players)
            logger.info(f"Session max_players: {max_players_from_session} (original: {session.max_players})")

            # Extract audio config (strip runtime fields, keep only track config)
            raw_audio = final_state.get("audio_state", {})
            audio_config = {}
            for channel_id, ch in raw_audio.items():
                if ch and ch.get("filename"):
                    audio_config[channel_id] = {
                        "filename": ch.get("filename"),
                        "asset_id": ch.get("asset_id"),
                        "volume": ch.get("volume", 0.8),
                        "looping": ch.get("looping", True),
                    }
            logger.info(f"Extracted audio config: {len(audio_config)} channels with loaded tracks")

            # Extract map config (asset_id + grid_config for session persistence)
            raw_map = final_state.get("map_state", {})
            map_config = {}
            if raw_map and raw_map.get("asset_id"):
                map_config = {
                    "asset_id": raw_map.get("asset_id"),
                    "grid_config": raw_map.get("grid_config")  # Preserve grid config for next session
                }
            logger.info(f"Extracted map config: {'has map' if map_config else 'no active map'}, grid: {map_config.get('grid_config') if map_config else None}")

        except Exception as e:
            # ANY error during state fetch - rollback to ACTIVE
            logger.error(f"Error fetching state for session {session_id}: {e}")
            session.abort_stop()  # Domain method: STOPPING → ACTIVE
            self.session_repo.save(session)
            logger.info(f"Session {session_id} rolled back to ACTIVE after error")
            raise ValueError(f"Cannot pause session: {str(e)}")

        # 6. PHASE 2: Write to PostgreSQL (with implicit transaction via repository)
        try:
            # Capture active_game_id BEFORE deactivate clears it
            active_game_id_to_cleanup = session.active_game_id

            # Update max_players from MongoDB session (if changed during session)
            session.max_players = max_players_from_session

            # Persist audio channel config for next session start
            session.audio_config = audio_config

            # Persist active map config for next session start
            session.map_config = map_config

            # Mark session INACTIVE (this will clear session.active_game_id to None)
            session.deactivate()  # Sets INACTIVE, stopped_at = now, active_game_id = None
            self.session_repo.save(session)
            logger.info(f"Session {session_id} marked INACTIVE in PostgreSQL with max_players={max_players_from_session}")

            # Note: Character locking is at CAMPAIGN level, not session level
            # Characters stay locked to campaign until player leaves campaign or releases character

        except Exception as pg_error:
            # PostgreSQL write failed - MongoDB session is PRESERVED
            logger.error(f"PostgreSQL write failed for {session_id}: {pg_error}")
            logger.error(f"MongoDB session {session.active_game_id} PRESERVED for manual retry")

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

        logger.info(f"Session {session_id} paused successfully, cleanup scheduled")
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
                    logger.info(f"Background cleanup complete for {session_id}")
            else:
                logger.warning(f"MongoDB cleanup failed for {session_id}: {response.text}")
                logger.warning(f"Cron job will clean up game {active_game_id}")

        except Exception as e:
            # Cleanup failed - cron will handle it
            logger.warning(f"Background cleanup failed for {session_id}: {e}")
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
                raise ValueError(f"Cannot fetch game state: {response.text}")

            final_state = response.json()["final_state"]
            logger.info(f"Fetched final state for {session_id}: {len(final_state.get('players', []))} players")

            # Extract max_players from MongoDB session stats
            max_players_from_session = final_state.get("session_stats", {}).get("max_players", session.max_players)
            logger.info(f"Session max_players: {max_players_from_session} (original: {session.max_players})")

            # Extract audio config (strip runtime fields, keep only track config)
            raw_audio = final_state.get("audio_state", {})
            audio_config = {}
            for channel_id, ch in raw_audio.items():
                if ch and ch.get("filename"):
                    audio_config[channel_id] = {
                        "filename": ch.get("filename"),
                        "asset_id": ch.get("asset_id"),
                        "volume": ch.get("volume", 0.8),
                        "looping": ch.get("looping", True),
                    }
            logger.info(f"Extracted audio config: {len(audio_config)} channels with loaded tracks")

            # Extract map config (asset_id + grid_config for session persistence)
            raw_map = final_state.get("map_state", {})
            map_config = {}
            if raw_map and raw_map.get("asset_id"):
                map_config = {
                    "asset_id": raw_map.get("asset_id"),
                    "grid_config": raw_map.get("grid_config")  # Preserve grid config for next session
                }
            logger.info(f"Extracted map config: {'has map' if map_config else 'no active map'}, grid: {map_config.get('grid_config') if map_config else None}")

        except Exception as e:
            # ANY error during state fetch - rollback to ACTIVE
            logger.error(f"Error fetching state for session {session_id}: {e}")
            session.abort_stop()  # Domain method: STOPPING → ACTIVE
            self.session_repo.save(session)
            logger.info(f"Session {session_id} rolled back to ACTIVE after error")
            raise ValueError(f"Cannot finish session: {str(e)}")

        # 7. PHASE 2: Write to PostgreSQL and mark as FINISHED
        try:
            # Capture active_game_id BEFORE mark_finished clears it
            active_game_id_to_cleanup = session.active_game_id

            # Update max_players from MongoDB session (if changed during session)
            session.max_players = max_players_from_session

            # Persist audio channel config (record of what was playing)
            session.audio_config = audio_config

            # Persist active map config (record of what was displayed)
            session.map_config = map_config

            # Mark session FINISHED (this will clear session.active_game_id to None)
            session.mark_finished()  # Sets FINISHED, stopped_at = now, active_game_id = None
            self.session_repo.save(session)
            logger.info(f"Session {session_id} marked FINISHED in PostgreSQL with max_players={max_players_from_session}")

            # Note: Character locking is at CAMPAIGN level, not session level
            # Characters stay locked to campaign until player leaves campaign or releases character

        except Exception as pg_error:
            # PostgreSQL write failed - MongoDB session is PRESERVED
            logger.error(f"PostgreSQL write failed for {session_id}: {pg_error}")
            logger.error(f"MongoDB session {session.active_game_id} PRESERVED for manual retry")

            # Leave session in STOPPING status so user knows there's an issue
            raise ValueError(
                f"Failed to save session data. Game preserved in MongoDB. "
                f"Please try finishing the session again. Error: {str(pg_error)}"
            )

        # 8. PHASE 3: Background cleanup (fire-and-forget)
        asyncio.create_task(self._async_cleanup(session_id, active_game_id_to_cleanup))

        logger.info(f"Session {session_id} finished successfully, cleanup scheduled")

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
                logger.info(f"Background cleanup successful for {session_id}")
            else:
                logger.warning(f"Background cleanup failed: {response.text}")

        except Exception as e:
            # Cleanup failed - cron will handle it
            logger.warning(f"Background cleanup failed for {session_id}: {e}")
            logger.warning(f"Cron job will clean up game {active_game_id}")


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


class ChangeCharacterForSession:
    """
    DEPRECATED: Character changes are now at CAMPAIGN level.

    To change character:
    1. Release character from campaign (ReleaseCharacterFromCampaign) - only when no active session
    2. Select new character for campaign (SelectCharacterForCampaign)

    This command is kept for backwards compatibility but will raise an error.
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
        old_character_id: UUID,
        new_character_id: UUID
    ) -> CharacterAggregate:
        """
        DEPRECATED: Character changes are now at CAMPAIGN level.

        To change your character:
        1. Release your current character from the campaign (when no active session)
        2. Select a new character for the campaign

        This maintains the domain rule that characters can only be in one campaign at a time.
        """
        raise ValueError(
            "Character changes are now at campaign level. "
            "Release your current character from the campaign first (when no active session), "
            "then select a new character for the campaign."
        )


class ChangeCharacterDuringGame:
    """
    DEPRECATED: Character changes during active game are no longer supported.

    Characters are locked to campaigns, not sessions. To change character:
    1. Wait for session to end/pause
    2. Release character from campaign (ReleaseCharacterFromCampaign)
    3. Select new character for campaign (SelectCharacterForCampaign)
    """

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
        DEPRECATED: Character changes during active game are no longer supported.

        Characters are now locked at campaign level. You cannot change your character
        while a session is active. Wait for the session to end, then release and
        reselect your character at the campaign level.
        """
        raise ValueError(
            "Character changes during active game are no longer supported. "
            "Wait for the session to end, then release your character from the campaign "
            "and select a new one."
        )


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
        - Character must be locked to the session's campaign

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

        # Verify character is locked to this session's campaign
        if character.active_campaign != session.campaign_id:
            raise ValueError("Character not locked to this campaign")

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
