# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import Dict, List, Optional
from dataclasses import dataclass
from uuid import UUID
import httpx
import logging
import asyncio
import os
from concurrent.futures import ThreadPoolExecutor
from sqlalchemy import update

from shared_contracts.assets import AssetRef
from shared_contracts.audio import AudioChannelState
from shared_contracts.character import DungeonMaster, PlayerCharacter, SessionUser
from shared_contracts.display import ActiveDisplayType
from shared_contracts.image import ImageConfig
from shared_contracts.map import MapConfig
from shared_contracts.session import (
    SessionEndResponse,
    SessionStartPayload,
    SessionStartResponse,
)

from modules.session.repositories.session_repository import SessionRepository
from modules.user.repositories.user_repository import UserRepository
from modules.user.model.user_model import User
from modules.characters.repositories.character_repository import CharacterRepository
from modules.characters.domain.character_aggregate import CharacterAggregate
from modules.campaign.repositories.campaign_repository import CampaignRepository
from modules.campaign.model.session_model import SessionJoinedUser
from modules.session.domain.session_aggregate import SessionEntity, SessionStatus
from modules.library.repositories.asset_repository import MediaAssetRepository
from modules.library.domain.map_asset_aggregate import MapAsset
from modules.library.domain.music_asset_aggregate import MusicAsset
from modules.library.domain.sfx_asset_aggregate import SfxAsset
from modules.library.domain.image_asset_aggregate import ImageAsset
from modules.events.event_manager import EventManager
from modules.session.domain.session_events import SessionEvents
from modules.campaign.domain.campaign_role import CampaignRole

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

        # Add session reference to campaign
        campaign.add_session(session.id)
        self.campaign_repo.save(campaign)

        # Broadcast session_created event to all campaign members (silent state update)
        # Get host user for screen name
        host_user = self.campaign_repo.db.query(User).filter(User.id == host_id).first()

        # Broadcast to non-DM members
        non_dm_members = [uid for uid in campaign.get_all_member_ids() if uid != host_id]
        if non_dm_members:
            events = SessionEvents.session_created(
                campaign_player_ids=non_dm_members,
                session_id=session.id,
                session_name=session.name,
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


class UpdateSession:
    """Update session details"""

    def __init__(self, session_repository: SessionRepository):
        self.session_repo = session_repository

    def execute(
        self,
        session_id: UUID,
        host_id: UUID,
        name: Optional[str] = None
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
        character_repository: CharacterRepository,
        campaign_repository: CampaignRepository,
        event_manager: EventManager,
        asset_repository: MediaAssetRepository = None,
        s3_service = None  # For presigned URL generation
    ):
        self.session_repo = session_repository
        self.user_repo = user_repository
        self.character_repo = character_repository
        self.campaign_repo = campaign_repository
        self.event_manager = event_manager
        self.asset_repo = asset_repository
        self.s3_service = s3_service

    def _build_session_users(self, session: SessionEntity, campaign) -> List[SessionUser]:
        """Build SessionUser DTOs for ALL joined users. Character data is optional."""
        session_users = []

        for user_id in session.joined_users:
            user = self.user_repo.get_by_id(user_id)
            if not user:
                logger.warning(f"Skipping ETL for missing user {user_id}")
                continue

            player_name = user.screen_name or user.email or ""
            if not player_name:
                logger.warning(f"Skipping ETL for user {user_id} with no player_name")
                continue

            role = campaign.get_role(user_id) if campaign else CampaignRole.SPECTATOR

            # Character is optional — moderators and spectators don't have one
            character_contract = None
            character = self.character_repo.get_user_character_for_campaign(user_id, session.campaign_id)
            if character:
                class_names = [class_info.character_class.value for class_info in character.character_classes]
                character_contract = PlayerCharacter(
                    user_id=str(user_id),
                    player_name=player_name,
                    campaign_role=role.value,
                    character_id=str(character.id),
                    character_name=character.character_name,
                    character_class=class_names,
                    character_race=character.character_race.value,
                    level=character.level,
                    hp_current=character.hp_current,
                    hp_max=character.hp_max,
                    ac=character.ac,
                )

            session_users.append(
                SessionUser(
                    user_id=str(user_id),
                    player_name=player_name,
                    campaign_role=role.value,
                    character=character_contract,
                )
            )

        logger.info(f"Built {len(session_users)} session user DTOs for session {session.id}")
        return session_users

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

    def _restore_audio_config(
        self, session: SessionEntity, asset_lookup: dict, url_map: dict
    ) -> Dict[str, AudioChannelState]:
        """Restore audio channel state from PostgreSQL domain aggregates (cold → hot)."""
        audio_config = {}
        if not session.audio_config or not self.asset_repo:
            return audio_config
        for channel_id, ch in session.audio_config.items():
            asset_id = ch.get("asset_id")
            if not asset_id:
                continue
            asset = asset_lookup.get(asset_id)
            if not asset or not isinstance(asset, (MusicAsset, SfxAsset)):
                logger.warning(f"Cannot restore channel {channel_id}: asset {asset_id} not in campaign")
                continue
            audio_config[channel_id] = asset.build_channel_state_for_game(url_map.get(asset.s3_key))
        logger.info(f"Restoring audio config: {len(audio_config)} channels from domain aggregates")
        return audio_config

    @staticmethod
    def _restore_map_config(
        session: SessionEntity, asset_lookup: dict, url_map: dict
    ) -> Optional[MapConfig]:
        """Restore map config from PostgreSQL domain aggregate (cold → hot).

        Field translation is owned by MapAsset.to_contract() — see
        map_asset_aggregate.py. This command stays orchestration-only.
        """
        if not session.map_config or not session.map_config.get("asset_id"):
            return None
        map_asset_id = session.map_config["asset_id"]
        map_asset = asset_lookup.get(map_asset_id)
        if not map_asset:
            logger.warning(f"Cannot restore map: asset {map_asset_id} not in campaign")
            return None
        if not isinstance(map_asset, MapAsset):
            logger.warning(f"Asset {map_asset_id} is not a MapAsset; cannot restore")
            return None
        fresh_url = url_map.get(map_asset.s3_key)
        if not fresh_url:
            logger.warning(f"Cannot restore map: asset {map_asset_id} has no presigned URL")
            return None
        logger.info(f"Restoring map: {map_asset.filename}")
        return map_asset.to_contract(file_path=fresh_url)

    @staticmethod
    def _restore_image_config(
        session: SessionEntity, asset_lookup: dict, url_map: dict
    ) -> Optional[ImageConfig]:
        """Restore image config from PostgreSQL domain aggregate (cold → hot)."""
        if not session.image_config or not session.image_config.get("asset_id"):
            return None
        image_asset_id = session.image_config["asset_id"]
        image_asset = asset_lookup.get(image_asset_id)
        if not image_asset:
            logger.warning(f"Cannot restore image: asset {image_asset_id} not in campaign")
            return None
        fresh_url = url_map.get(image_asset.s3_key)
        if not fresh_url:
            logger.warning(f"Cannot restore image: asset {image_asset_id} has no presigned URL")
            return None
        logger.info(f"Restoring image: {image_asset.filename}")

        # Build config — use asset-level display config if available
        config_kwargs = dict(
            asset_id=image_asset_id,
            filename=image_asset.filename,
            original_filename=image_asset.filename,
            file_path=fresh_url,
            file_size=image_asset.file_size,
        )
        if hasattr(image_asset, 'image_fit') and image_asset.image_fit:
            config_kwargs["image_fit"] = image_asset.image_fit
        if hasattr(image_asset, 'display_mode') and image_asset.display_mode:
            config_kwargs["display_mode"] = image_asset.display_mode
        if hasattr(image_asset, 'aspect_ratio') and image_asset.aspect_ratio:
            config_kwargs["aspect_ratio"] = image_asset.aspect_ratio
        if hasattr(image_asset, 'image_position_x') and image_asset.image_position_x is not None:
            config_kwargs["image_position_x"] = image_asset.image_position_x
        if hasattr(image_asset, 'image_position_y') and image_asset.image_position_y is not None:
            config_kwargs["image_position_y"] = image_asset.image_position_y
        if hasattr(image_asset, 'visual_overlays') and image_asset.visual_overlays:
            config_kwargs["visual_overlays"] = image_asset.visual_overlays
        if hasattr(image_asset, 'motion') and image_asset.motion:
            from shared_contracts.cine import MotionConfig as MotionConfigContract
            config_kwargs["motion"] = MotionConfigContract.model_validate(image_asset.motion.to_dict())

        return ImageConfig(**config_kwargs)

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
        if not campaign:
            raise ValueError(f"Campaign {session.campaign_id} not found — cannot start session without a campaign")
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
            # 6. Validate host user exists
            host_user = self.user_repo.get_by_id(host_id)
            if not host_user:
                raise ValueError("Host user not found")

            # 7. Fetch campaign assets and generate fresh presigned URLs
            campaign_assets = []
            asset_lookup = {}
            url_map = {}
            if self.asset_repo:
                campaign_assets = self.asset_repo.get_by_campaign_id(session.campaign_id)

                # Generate presigned URLs in parallel (CPU-bound HMAC signing)
                url_map = await self._generate_presigned_urls_parallel(campaign_assets)
                logger.info(f"Found {len(campaign_assets)} assets for campaign {session.campaign_id} with {len(url_map)} fresh URLs")

                # Build asset_id → asset aggregate lookup (single source of truth for warm-up)
                asset_lookup = {str(a.id): a for a in campaign_assets}

            # UX delay: Show "Starting" animation to users
            await asyncio.sleep(2)

            # 8. Build typed payload for api-game — restore session state from domain aggregates
            audio_config_for_game = self._restore_audio_config(session, asset_lookup, url_map)
            map_config_for_game = self._restore_map_config(session, asset_lookup, url_map)
            image_config_for_game = self._restore_image_config(session, asset_lookup, url_map)
            session_users_for_game = self._build_session_users(session, campaign)
            dm_contract = DungeonMaster(
                user_id=str(campaign.dm_id),
                player_name=host_user.screen_name or host_user.email or "",
            )

            payload = SessionStartPayload(
                session_id=str(session.id),
                campaign_id=str(session.campaign_id),
                dungeon_master=dm_contract,
                max_players=session.max_players,
                joined_user_ids=[str(uid) for uid in session.joined_users],
                session_users=session_users_for_game,
                assets=[
                    AssetRef(
                        id=str(asset.id),
                        filename=asset.filename,
                        s3_key=asset.s3_key,
                        asset_type=asset.asset_type.value if hasattr(asset.asset_type, 'value') else str(asset.asset_type),
                        s3_url=url_map.get(asset.s3_key),
                        file_size=asset.file_size,
                    )
                    for asset in campaign_assets
                ] if self.asset_repo else [],
                audio_config=audio_config_for_game,
                map_config=map_config_for_game,
                image_config=image_config_for_game,
                active_display=ActiveDisplayType(session.active_display) if session.active_display else None,
            )

            # 9. Call api-game (synchronous await)
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "http://api-game:8081/game/session/start",
                    json=payload.model_dump(),
                    timeout=10.0
                )

            if response.status_code != 200:
                error_detail = response.text
                logger.error(f"api-game error {response.status_code}: {error_detail}")
                raise ValueError(f"Failed to create game: {error_detail}")

            # 10. Parse response
            start_response = SessionStartResponse(**response.json())
            active_game_id = start_response.session_id

            # 11. Mark ACTIVE with the MongoDB game ID
            session.activate(active_game_id)
            self.session_repo.save(session)

            logger.info(f"Session {session_id} ACTIVE with game {active_game_id}")

            # 12. Broadcast session_started event to all campaign members + DM (with notification)
            campaign = self.campaign_repo.get_by_id(session.campaign_id)
            if campaign:
                # Include DM in recipient list (DM gets confirmation toast)
                all_recipients = campaign.get_all_member_ids()

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
                    await self.event_manager.broadcast(event_config)

                logger.info(f"Broadcasting session_started event to {len(all_recipients)} recipients for session {session.id}")

            return session

        except Exception as e:
            # ANY error after STARTING should rollback to INACTIVE
            logger.error(f"Unexpected error starting session {session_id}: {e}")
            session.abort_start()  # Domain method: STARTING → INACTIVE
            self.session_repo.save(session)
            logger.info(f"Session {session_id} rolled back to INACTIVE after error")
            raise ValueError(f"Failed to start session: {str(e)}")


# === Shared ETL helpers for PauseSession and FinishSession ===

@dataclass
class _ExtractedGameState:
    """State extracted from MongoDB during session ETL (hot → cold)"""
    max_players: int
    audio_config: dict
    map_config: dict
    image_config: dict
    active_display: Optional[str]


async def _extract_and_sync_game_state(
    session_id: UUID,
    session: SessionEntity,
    asset_repo: MediaAssetRepository,
    session_repo: SessionRepository
) -> _ExtractedGameState:
    """
    PHASE 1 of session ETL: fetch final state from MongoDB and sync asset configs to PostgreSQL.

    1. Fetches final state from api-game (non-destructive, validate_only=True)
    2. Syncs per-asset volumes/effects back to PostgreSQL asset records
    3. Extracts thin config references for session cold storage

    On failure, rolls session back to ACTIVE via abort_stop() and raises ValueError.
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "http://api-game:8081/game/session/end",
                params={"validate_only": True},
                json={"session_id": str(session_id)},
                timeout=10.0
            )

        if response.status_code != 200:
            logger.error(f"Failed to fetch final state: {response.text}")
            raise ValueError(f"Cannot fetch game state: {response.text}")

        end_response = SessionEndResponse(**response.json())
        final_state = end_response.final_state
        logger.info(f"Fetched final state for {session_id}: {len(final_state.players)} players")

        # Extract max_players from MongoDB session stats
        max_players = final_state.session_stats.max_players if final_state.session_stats else session.max_players
        logger.info(f"Session max_players: {max_players} (original: {session.max_players})")

        # Collect per-asset audio settings from BOTH active channels AND stashed track configs.
        # Uses a common shape: {volume, looping, effects} — channel state always has values,
        # track config has Optional fields (None = don't override).
        asset_audio_settings = {}
        for channel_id, ch in final_state.audio_state.items():
            if ch and ch.asset_id:
                asset_audio_settings[ch.asset_id] = {
                    "volume": ch.volume,
                    "looping": ch.looping,
                    "effects": ch.effects,
                }
        for asset_id_str, tc in final_state.audio_track_config.items():
            if asset_id_str not in asset_audio_settings:
                asset_audio_settings[asset_id_str] = {
                    "volume": tc.volume,
                    "looping": tc.looping,
                    "effects": tc.effects,
                }

        # Sync per-asset volumes and effects back to PostgreSQL (ETL: hot → cold)
        if asset_repo and asset_audio_settings:
            synced_assets = set()
            for asset_id_str, settings in asset_audio_settings.items():
                try:
                    asset = asset_repo.get_by_id(UUID(asset_id_str))
                    if asset and isinstance(asset, (MusicAsset, SfxAsset)):
                        config_kwargs = {}
                        if settings["volume"] is not None:
                            config_kwargs["default_volume"] = settings["volume"]
                        if settings["looping"] is not None:
                            config_kwargs["default_looping"] = settings["looping"]
                        effects = settings["effects"]
                        if effects and isinstance(asset, MusicAsset):
                            config_kwargs["effect_eq_enabled"] = effects.eq
                            config_kwargs["effect_hpf_enabled"] = effects.hpf
                            config_kwargs["effect_hpf_mix"] = effects.hpf_mix
                            config_kwargs["effect_lpf_enabled"] = effects.lpf
                            config_kwargs["effect_lpf_mix"] = effects.lpf_mix
                            config_kwargs["effect_reverb_enabled"] = effects.reverb
                            config_kwargs["effect_reverb_mix"] = effects.reverb_mix
                            config_kwargs["effect_reverb_preset"] = effects.reverb_preset
                        if config_kwargs:
                            asset.update_audio_config(**config_kwargs)
                            asset_repo.save(asset)
                            synced_assets.add(asset_id_str)
                except Exception as e:
                    logger.warning(f"Failed to sync audio config for asset {asset_id_str}: {e}")
            logger.info(f"Synced {len(synced_assets)} asset audio configs to PostgreSQL (volume, looping, effects)")

        # Thin JSONB: store only channel → asset_id references (all config synced back to assets above)
        audio_config = {}
        for channel_id, ch in final_state.audio_state.items():
            if ch and ch.asset_id:
                audio_config[channel_id] = {"asset_id": ch.asset_id}
        logger.info(f"Extracted audio config: {len(audio_config)} channel references")

        # Extract map config — sync grid_config back to MapAsset, store only asset_id reference
        map_config = {}
        if final_state.map_state and final_state.map_state.asset_id:
            map_asset_id = final_state.map_state.asset_id
            map_config = {"asset_id": map_asset_id}

            # Sync map state back to MapAsset (ETL: hot → cold).
            # Field translation is owned by MapAsset.update_from_contract()
            # — see map_asset_aggregate.py. New MapConfig fields land
            # there and flow through automatically.
            if asset_repo and final_state.map_state:
                try:
                    map_asset = asset_repo.get_by_id(UUID(map_asset_id))
                    if map_asset and isinstance(map_asset, MapAsset):
                        map_asset.update_from_contract(final_state.map_state)
                        asset_repo.save(map_asset)
                        logger.info(f"Synced map state back to MapAsset {map_asset_id}")
                except Exception as e:
                    logger.warning(f"Failed to sync map config for {map_asset_id}: {e}")
        logger.info(f"Extracted map config: {'has map' if map_config else 'no active map'}")

        # Extract image config (asset_id + display config for session persistence)
        image_config = {}
        if final_state.image_state and final_state.image_state.asset_id:
            image_config = {
                "asset_id": final_state.image_state.asset_id,
                "display_mode": getattr(final_state.image_state, 'display_mode', "float"),
                "aspect_ratio": getattr(final_state.image_state, 'aspect_ratio', None),
            }
            # Sync display config back to the image asset (like map grid sync)
            if asset_repo:
                image_asset_id = final_state.image_state.asset_id
                try:
                    image_asset = asset_repo.get_by_id(UUID(image_asset_id))
                    if image_asset and isinstance(image_asset, ImageAsset):
                        image_asset.update_image_config_from_game(
                            display_mode=getattr(final_state.image_state, 'display_mode', None),
                            aspect_ratio=getattr(final_state.image_state, 'aspect_ratio', None),
                            image_position_x=getattr(final_state.image_state, 'image_position_x', None),
                            image_position_y=getattr(final_state.image_state, 'image_position_y', None),
                        )
                        asset_repo.save(image_asset)
                        logger.info(f"Synced display config back to ImageAsset {image_asset_id}")
                except Exception as e:
                    logger.warning(f"Failed to sync display config for image {image_asset_id}: {e}")
        logger.info(f"Extracted image config: {'has image' if image_config else 'no active image'}")

        # Extract active_display
        active_display = final_state.active_display.value if final_state.active_display else None
        logger.info(f"Extracted active_display: {active_display}")

        return _ExtractedGameState(
            max_players=max_players,
            audio_config=audio_config,
            map_config=map_config,
            image_config=image_config,
            active_display=active_display,
        )

    except Exception as e:
        # ANY error during state fetch - rollback to ACTIVE
        logger.error(f"Error fetching state for session {session_id}: {e}")
        session.abort_stop()  # Domain method: STOPPING → ACTIVE
        session_repo.save(session)
        logger.info(f"Session {session_id} rolled back to ACTIVE after error")
        raise ValueError(f"Cannot complete session operation: {str(e)}")


async def _async_cleanup_game(active_game_id: str, session_id: UUID):
    """
    Background task to delete MongoDB session (fire-and-forget).

    If this fails, the hourly cron job will clean up orphaned sessions.
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.delete(
                f"http://api-game:8081/game/session/{active_game_id}",
                params={"keep_logs": False},
                timeout=5.0
            )

        if response.status_code == 200:
            logger.info(f"Background cleanup successful for session {session_id}")
        else:
            logger.warning(f"MongoDB cleanup failed for {session_id}: {response.text}")
            logger.warning(f"Cron job will clean up game {active_game_id}")

    except Exception as e:
        logger.warning(f"Background cleanup failed for {session_id}: {e}")
        logger.warning(f"Cron job will clean up game {active_game_id}")


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
        event_manager: EventManager,
        asset_repository: MediaAssetRepository = None
    ):
        self.session_repo = session_repository
        self.user_repo = user_repository
        self.character_repo = character_repository
        self.campaign_repo = campaign_repository
        self.event_manager = event_manager
        self.asset_repo = asset_repository

    async def execute(self, session_id: UUID, host_id: UUID) -> SessionEntity:
        """
        Pause a session using fail-safe three-phase pattern.

        Raises:
            ValueError: If validation fails or api-game call fails
        """
        # 1. Load and validate session
        session = self.session_repo.get_by_id(session_id)
        if not session:
            raise ValueError("Session not found")
        if session.host_id != host_id:
            raise ValueError("Only the host can pause this session")
        if session.status != SessionStatus.ACTIVE:
            raise ValueError(f"Cannot pause session in {session.status} status")

        # 2. Set STOPPING status
        session.pause()
        self.session_repo.save(session)
        logger.info(f"Session {session_id} status set to STOPPING")

        # 3. PHASE 1: Extract and sync game state from MongoDB
        extracted = await _extract_and_sync_game_state(
            session_id, session, self.asset_repo, self.session_repo
        )

        # 4. PHASE 2: Write to PostgreSQL
        try:
            active_game_id_to_cleanup = session.active_game_id

            session.max_players = extracted.max_players
            session.audio_config = extracted.audio_config
            session.map_config = extracted.map_config
            session.image_config = extracted.image_config
            session.active_display = extracted.active_display

            session.deactivate()  # Sets INACTIVE, stopped_at = now, active_game_id = None
            self.session_repo.save(session)
            logger.info(f"Session {session_id} marked INACTIVE in PostgreSQL")

        except Exception as pg_error:
            logger.error(f"PostgreSQL write failed for {session_id}: {pg_error}")
            logger.error(f"MongoDB session {session.active_game_id} PRESERVED for manual retry")
            raise ValueError(
                f"Failed to save session data. Game preserved in MongoDB. "
                f"Please try pausing the session again. Error: {str(pg_error)}"
            )

        # 5. Broadcast session_paused event
        campaign = self.campaign_repo.get_by_id(session.campaign_id)
        if campaign:
            host_user = self.user_repo.get_by_id(host_id)
            all_recipients = campaign.get_all_member_ids()

            events = SessionEvents.session_paused(
                active_participant_ids=all_recipients,
                session_id=session.id,
                session_name=session.name,
                campaign_id=session.campaign_id,
                paused_by_id=host_id,
                paused_by_screen_name=host_user.screen_name if host_user and host_user.screen_name else (host_user.email if host_user else "Unknown")
            )
            for event_config in events:
                await self.event_manager.broadcast(event_config)
            logger.info(f"Broadcasting session_paused event to {len(all_recipients)} recipients for session {session.id}")

        # 6. PHASE 3: Background cleanup (fire-and-forget)
        asyncio.create_task(_async_cleanup_game(active_game_id_to_cleanup, session_id))

        logger.info(f"Session {session_id} paused successfully, cleanup scheduled")
        return session


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
        event_manager: EventManager,
        asset_repository: MediaAssetRepository = None
    ):
        self.session_repo = session_repository
        self.user_repo = user_repository
        self.character_repo = character_repository
        self.campaign_repo = campaign_repository
        self.event_manager = event_manager
        self.asset_repo = asset_repository

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
                all_recipients = campaign.get_all_member_ids()

                events = SessionEvents.session_finished(
                    dm_id=campaign.dm_id,
                    participant_ids=[uid for uid in campaign.get_all_member_ids() if uid != campaign.dm_id],
                    session_id=session.id,
                    session_name=session.name,
                    campaign_id=session.campaign_id
                )

                # Broadcast to each recipient
                for event_config in events:
                    await self.event_manager.broadcast(event_config)

                logger.info(f"Broadcasting session_finished event to {len(all_recipients)} recipients for session {session.id}")

            return session

        # 4. If session is ACTIVE, perform ETL then mark as FINISHED
        if session.status != SessionStatus.ACTIVE:
            raise ValueError(f"Cannot finish session in {session.status} status. Only ACTIVE or INACTIVE sessions can be finished.")

        # 5. Set STOPPING status (ETL process starting)
        session.finish_from_active()  # Domain method sets status = STOPPING
        self.session_repo.save(session)
        logger.info(f"Session {session_id} status set to STOPPING (finishing)")

        # 6. PHASE 1: Extract and sync game state from MongoDB
        extracted = await _extract_and_sync_game_state(
            session_id, session, self.asset_repo, self.session_repo
        )

        # 7. PHASE 2: Write to PostgreSQL and mark as FINISHED
        try:
            active_game_id_to_cleanup = session.active_game_id

            session.max_players = extracted.max_players
            session.audio_config = extracted.audio_config
            session.map_config = extracted.map_config
            session.image_config = extracted.image_config
            session.active_display = extracted.active_display

            session.mark_finished()  # Sets FINISHED, stopped_at = now, active_game_id = None
            self.session_repo.save(session)
            logger.info(f"Session {session_id} marked FINISHED in PostgreSQL")

        except Exception as pg_error:
            logger.error(f"PostgreSQL write failed for {session_id}: {pg_error}")
            logger.error(f"MongoDB session {session.active_game_id} PRESERVED for manual retry")
            raise ValueError(
                f"Failed to save session data. Game preserved in MongoDB. "
                f"Please try finishing the session again. Error: {str(pg_error)}"
            )

        # 8. Broadcast session_finished event to all campaign members (silent state update)
        campaign = self.campaign_repo.get_by_id(session.campaign_id)
        if campaign:
            all_recipients = campaign.get_all_member_ids()

            events = SessionEvents.session_finished(
                dm_id=campaign.dm_id,
                participant_ids=[uid for uid in all_recipients if uid != campaign.dm_id],
                session_id=session.id,
                session_name=session.name,
                campaign_id=session.campaign_id
            )
            for event_config in events:
                await self.event_manager.broadcast(event_config)
            logger.info(f"Broadcasting session_finished event to {len(all_recipients)} recipients for session {session.id}")

        # 9. PHASE 3: Background cleanup (fire-and-forget)
        asyncio.create_task(_async_cleanup_game(active_game_id_to_cleanup, session_id))

        logger.info(f"Session {session_id} finished successfully, cleanup scheduled")
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


class DisconnectFromGame:
    """Handle player disconnect from active game (character-level ETL)"""

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

        Character-level ETL - updates ONLY the character's state from MongoDB to PostgreSQL.

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

        # Save character (character-level ETL complete)
        self.character_repo.save(character)

        logger.info(f"Character-level ETL complete for character {character_id} in session {session_id}")

        return character
