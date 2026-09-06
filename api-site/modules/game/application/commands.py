# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Game commands — the hot/cold boundary.

Everything that moves state between PostgreSQL and api-game lives here, because
every one of those movements belongs to a game rather than to a session:

- StartGame mints the row (its id is the room id), seeds the room from the
  session's newest ended game merged with the campaign's current baseline, and
  marks the game live once api-game confirms.
- EndGame runs the three-phase take-down and writes what the game ended with
  onto the game itself, which is what the next game will seed from.
- DisconnectFromGame is the character-level ETL: one player's runtime state to
  their own character row, which is where run data on a user-owned object lives.

The session is read here (for its campaign, host and planned next-game name) and
written in exactly two places: clearing the planned name once a game has taken
it, and clearing the schedule when the host ends a game. Neither is play state.
"""

from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
from dataclasses import dataclass, field
from uuid import UUID
import httpx
import logging
import asyncio
import os
from concurrent.futures import ThreadPoolExecutor
from pydantic import ValidationError

from shared_contracts.assets import AssetRef
from shared_contracts.audio import AudioChannelState, AudioTrackConfig
from shared_contracts.character import DungeonMaster, PlayerCharacter, SessionUser
from shared_contracts.display import ActiveDisplayType
from shared_contracts.image import ImageConfig
from shared_contracts.map import MapConfig
from shared_contracts.map_token import MapToken, TokenImageRef
from shared_contracts.session import (
    LogEntry,
    SessionEndResponse,
    SessionStartPayload,
    SessionStartResponse,
)

from modules.game.domain.game_aggregate import Attendee, EndReason, GameAggregate, GameStatus
from modules.game.repositories.game_repository import GameRepository
from modules.session.repositories.session_repository import SessionRepository
from modules.session.domain.token_merge import merge_token_boards
from modules.session.domain.session_events import SessionEvents
from modules.user.repositories.user_repository import UserRepository
from modules.characters.repositories.character_repository import CharacterRepository
from modules.characters.domain.character_aggregate import CharacterAggregate
from modules.campaign.repositories.campaign_repository import CampaignRepository
from modules.campaign.domain.campaign_role import CampaignRole
from modules.library.repositories.asset_repository import MediaAssetRepository
from modules.library.domain.map_asset_aggregate import MapAsset
from modules.library.domain.music_asset_aggregate import MusicAsset
from modules.library.domain.sfx_asset_aggregate import SfxAsset
from modules.library.domain.image_asset_aggregate import ImageAsset
from modules.events.event_manager import EventManager

logger = logging.getLogger(__name__)


class StartGame:
    """
    Start a game: mint the row, build the room, go ACTIVE.

    The game's id is decided before api-game is called because that id IS the
    room id. Continuity comes from the session's newest ended game: its board,
    seed, log, screen and audio are what the new room opens with, merged against
    the campaign's current workshop baseline. A session's first game has no
    predecessor and opens from the baseline alone.
    """

    def __init__(
        self,
        game_repository: GameRepository,
        session_repository: SessionRepository,
        user_repository: UserRepository,
        character_repository: CharacterRepository,
        campaign_repository: CampaignRepository,
        event_manager: EventManager,
        asset_repository: MediaAssetRepository = None,
        s3_service=None  # For presigned URL generation
    ):
        self.game_repo = game_repository
        self.session_repo = session_repository
        self.user_repo = user_repository
        self.character_repo = character_repository
        self.campaign_repo = campaign_repository
        self.event_manager = event_manager
        self.asset_repo = asset_repository
        self.s3_service = s3_service

    def _build_session_users(self, session, campaign) -> List[SessionUser]:
        """Build SessionUser DTOs from the campaign's CURRENT members.

        The campaign is the source of truth at game start (cold→hot ETL) — NOT the frozen
        session roster snapshot, which misses anyone who joined while no game was running
        (and keeps anyone who has since left the campaign). Character data is optional
        (moderators/spectators have none).
        """
        session_users = []

        member_ids = campaign.get_all_member_ids() if campaign else list(session.joined_users)
        for user_id in member_ids:
            user = self.user_repo.get_by_id(user_id)
            if not user:
                logger.warning(f"Skipping ETL for missing user {user_id}")
                continue

            # Identity is screen_name ONLY — never email or UUID (PII). Empty is acceptable; the
            # client resolves character_name → screen_name → a neutral default. Do NOT drop the
            # user for a missing name — that would silently un-enroll them from the game.
            player_name = user.screen_name or ""

            role = campaign.get_role(user_id) if campaign else CampaignRole.SPECTATOR

            # Character is optional — moderators and spectators don't have one
            character_contract = None
            character = self.character_repo.get_user_character_for_campaign(user_id, session.campaign_id)
            if character:
                class_names = [entry.class_code for entry in character.class_entries]
                character_contract = PlayerCharacter(
                    user_id=str(user_id),
                    player_name=player_name,
                    campaign_role=role.value,
                    character_id=str(character.id),
                    character_name=character.character_name,
                    character_class=class_names,
                    character_race=character.species_code,
                    level=character.level,
                    hp_current=character.hp_current,
                    hp_max=character.hp_max,
                    ac=character.ac,
                    color=character.color,
                    avatar_asset_id=str(character.avatar_asset_id) if character.avatar_asset_id else None,
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
        self, previous_game: Optional[GameAggregate], asset_lookup: dict, url_map: dict
    ) -> Dict[str, AudioChannelState]:
        """Restore audio channel state from the previous game (cold → hot).

        previous_game is None for a session's first game — nothing to restore,
        which is exactly what an empty config produces.
        """
        audio_config = {}
        stored_channels = (previous_game.audio_config if previous_game else None) or {}
        if not stored_channels or not self.asset_repo:
            return audio_config
        for channel_id, channel in stored_channels.items():
            asset_id = channel.get("asset_id")
            if not asset_id:
                continue
            asset = asset_lookup.get(asset_id)
            if not asset or not isinstance(asset, (MusicAsset, SfxAsset)):
                logger.warning(f"Cannot restore channel {channel_id}: asset {asset_id} not in campaign")
                continue
            audio_config[channel_id] = asset.build_channel_state_for_game(url_map.get(asset.s3_key))
        logger.info(f"Restoring audio config: {len(audio_config)} channels from domain aggregates")
        return audio_config

    def _restore_audio_track_config(self, asset_lookup: dict) -> Dict[str, AudioTrackConfig]:
        """Restore the per-track config stash (cold → hot).

        Closes the ETL asymmetry: End syncs stash tweaks onto the asset rows
        (see _extract_and_sync_game_state), but the stash itself was never
        refilled at start — so a track loaded mid-game after a restart came
        back without its saved tweaks. Field translation stays owned by the
        aggregates' build_channel_state_for_game(); this only re-shapes it.
        """
        track_config = {}
        for asset_id_str, asset in asset_lookup.items():
            if not isinstance(asset, (MusicAsset, SfxAsset)):
                continue
            channel_state = asset.build_channel_state_for_game(None)
            track_config[asset_id_str] = AudioTrackConfig(
                volume=channel_state.volume,
                looping=channel_state.looping,
                effects=channel_state.effects,
                loop_mode=channel_state.loop_mode,
                loop_start=channel_state.loop_start,
                loop_end=channel_state.loop_end,
            )
        logger.info(f"Restoring audio track config stash: {len(track_config)} tracks")
        return track_config

    def _build_token_images(self, merged_boards: dict, session_users: list, asset_lookup: dict, url_map: dict) -> dict:
        """Resolve every image the game's tokens may render into a
        TokenImageRef (signed URL + "token" focal area) — decisions 27/30.

        Two sources union: images referenced by the merged boards, and the
        rostered characters' avatars (tokens v3) — a pc token placed
        mid-game must find its avatar already resolvable, so the roster
        is collected up front regardless of what is on the boards at start.

        Baselines are per-asset and shared across campaigns, so a board may
        reference an image outside this campaign's library — same for a
        character avatar, which lives in its owner's personal library: both
        resolve by id and sign individually. An unresolvable image degrades
        to the color disc client-side (log, never fail a start).
        """
        referenced_image_ids = set()
        for board_tokens in merged_boards.values():
            for board_token in board_tokens:
                if board_token.get("image_asset_id"):
                    referenced_image_ids.add(board_token["image_asset_id"])
        for session_user in session_users:
            if session_user.character and session_user.character.avatar_asset_id:
                referenced_image_ids.add(session_user.character.avatar_asset_id)

        token_image_refs = {}
        for image_id in referenced_image_ids:
            image_asset = asset_lookup.get(image_id)
            if image_asset is None and self.asset_repo:
                try:
                    image_asset = self.asset_repo.get_by_id(UUID(image_id))
                except (ValueError, TypeError):
                    image_asset = None
            if not isinstance(image_asset, ImageAsset):
                logger.warning(f"Token image {image_id} unresolvable — tokens fall back to color discs")
                continue

            signed_url = url_map.get(image_asset.s3_key)
            if not signed_url and self.s3_service:
                try:
                    signed_url = self.s3_service.generate_download_url(image_asset.s3_key)
                except Exception as sign_error:
                    logger.warning(f"Failed to sign token image {image_id}: {sign_error}")

            token_area = image_asset.get_focal_area("token")
            token_image_refs[image_id] = TokenImageRef(
                url=signed_url,
                token_area=token_area,
            )

        logger.info(f"Resolved {len(token_image_refs)} token image(s)")
        return token_image_refs

    @staticmethod
    def _stamp_pc_token_avatars(merged_boards: dict, session_users: list) -> dict:
        """Re-stamp placed pc tokens' image refs from the current roster
        (tokens v3, decision 39). PC tokens survive across games via the
        previous game's board (decision 24), which would otherwise freeze the
        avatar they were placed with. Invariant by construction: a pc token's
        image always derives from its owner's current avatar as of game start —
        including a cleared avatar (None → color disc). Owners no longer on
        the roster keep whatever ref they had (conservative: never guess).
        """
        avatar_by_user_id = {}
        for session_user in session_users:
            if session_user.character:
                avatar_by_user_id[session_user.user_id] = session_user.character.avatar_asset_id

        stamped_count = 0
        for board_tokens in merged_boards.values():
            for board_token in board_tokens:
                if board_token.get("kind") != "pc":
                    continue
                owner_id = board_token.get("owner_user_id")
                if owner_id not in avatar_by_user_id:
                    continue
                current_avatar = avatar_by_user_id[owner_id]
                if board_token.get("image_asset_id") != current_avatar:
                    board_token["image_asset_id"] = current_avatar
                    stamped_count += 1

        if stamped_count:
            logger.info(f"Re-stamped avatar refs on {stamped_count} pc token(s) at game start")
        return merged_boards

    @staticmethod
    def _restore_map_token_state(previous_game: Optional[GameAggregate], asset_lookup: dict) -> tuple:
        """Restore the per-map token boards (cold → hot) via the three-way
        start merge (tokens v2, decision 24), and build the NEXT seed.

        Per map: merge(seed, previous board, current baseline), play wins —
        see modules.session.domain.token_merge. A session's first game has no
        previous game, so empty seed and board degenerate to pure baseline
        seeding on the same path.

        Returns (boards_for_payload, new_seed). The caller writes new_seed onto
        the NEW game only after api-game accepts the start — the seed must
        describe the boards a game actually began with.

        Existing protections stay: orphan boards for deleted maps are
        pruned and logged; malformed stored tokens are salvaged per-token
        rather than failing the whole start.
        """
        stored_boards = (previous_game.map_token_state if previous_game else None) or {}
        seed_boards = (previous_game.map_token_seed if previous_game else None) or {}

        for board_asset_id, board_tokens in stored_boards.items():
            if board_asset_id not in asset_lookup:
                logger.info(
                    f"Pruned orphan token board for deleted map asset {board_asset_id} "
                    f"({len(board_tokens or [])} tokens)"
                )

        merged_boards = {}
        new_seed = {}
        merged_board_count = 0
        for lookup_asset_id, lookup_asset in asset_lookup.items():
            if not isinstance(lookup_asset, MapAsset):
                continue

            salvaged_tokens = []
            for board_token in stored_boards.get(lookup_asset_id) or []:
                try:
                    salvaged_tokens.append(MapToken(**board_token).model_dump())
                except (ValidationError, TypeError) as token_error:
                    logger.warning(
                        f"Dropped malformed stored map token on board {lookup_asset_id} "
                        f"at game start: {token_error}"
                    )

            baseline_tokens = lookup_asset.build_token_baseline()
            merged_tokens = merge_token_boards(
                seed_boards.get(lookup_asset_id) or [],
                salvaged_tokens,
                baseline_tokens,
            )
            if merged_tokens:
                merged_boards[lookup_asset_id] = merged_tokens
                merged_board_count += 1
            if baseline_tokens:
                new_seed[lookup_asset_id] = baseline_tokens

        logger.info(
            f"Restoring map token state: {merged_board_count} board(s) merged "
            f"(seed covers {len(new_seed)} baseline map(s))"
        )
        return merged_boards, new_seed

    @staticmethod
    def _restore_map_config(
        previous_game: Optional[GameAggregate], asset_lookup: dict, url_map: dict
    ) -> Optional[MapConfig]:
        """Restore map config from the previous game (cold → hot).

        Field translation is owned by MapAsset.to_contract() — see
        map_asset_aggregate.py. This command stays orchestration-only.
        """
        stored_map = (previous_game.map_config if previous_game else None) or {}
        if not stored_map.get("asset_id"):
            return None
        map_asset_id = stored_map["asset_id"]
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
        previous_game: Optional[GameAggregate], asset_lookup: dict, url_map: dict
    ) -> Optional[ImageConfig]:
        """Restore image config from the previous game (cold → hot)."""
        stored_image = (previous_game.image_config if previous_game else None) or {}
        if not stored_image.get("asset_id"):
            return None
        image_asset_id = stored_image["asset_id"]
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

    async def execute(self, session_id: UUID, host_id: UUID) -> GameAggregate:
        """
        Start a game for this session.

        Flow:
        1. Validate the session, its host, and that nothing is already running
        2. Mint the game (STARTING) — its id becomes the room id
        3. Seed the room from the session's newest ended game + the campaign baseline
        4. Call api-game to create the MongoDB room
        5. Mark the game ACTIVE and consume the planned name

        Raises:
            ValueError: session missing, caller is not the host, a game is already
                running, or the api-game call fails. On any failure after step 2
                the minted row is deleted: a game that never reached ACTIVE is not
                a game that happened, and leaving it would put a phantom in the
                history and a wrong answer under "newest ended game".
        """
        # 1. Load and validate the session
        session = self.session_repo.get_by_id(session_id)
        if not session:
            raise ValueError("Session not found")

        if session.host_id != host_id:
            raise ValueError("Only the host can start the game")

        if self.game_repo.get_open_game_for_session(session_id):
            raise ValueError("A game is already running")

        # 2. Load the campaign — the source of truth for the roster, the DM, and
        # the seat count the game is built with.
        campaign = self.campaign_repo.get_by_id(session.campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {session.campaign_id} not found — cannot start a game without a campaign")

        # 3. Mint the game. The row exists before api-game is called because its
        # id IS the room id, and it carries the name the GM planned beside the date.
        game = GameAggregate.create(
            session_id=session.id,
            campaign_id=session.campaign_id,
            host_id=host_id,
            name=session.next_game_name,
        )
        self.game_repo.save(game)
        logger.info(f"Game {game.id} minted for session {session_id} (STARTING)")

        # Everything after the row exists is wrapped: any failure deletes it.
        try:
            # 4. Validate host user exists
            host_user = self.user_repo.get_by_id(host_id)
            if not host_user:
                raise ValueError("Host user not found")

            # 5. The previous game is where continuity comes from. None for a
            # session's first game — the restore helpers degrade to the baseline.
            previous_game = self.game_repo.get_newest_ended_game_for_session(session_id)
            if previous_game:
                logger.info(f"Seeding game {game.id} from previous game {previous_game.id}")
            else:
                logger.info(f"Game {game.id} is this session's first — seeding from the campaign baseline")

            # 6. Fetch campaign assets and generate fresh presigned URLs
            campaign_assets = []
            asset_lookup = {}
            url_map = {}
            urls_expire_at = None
            if self.asset_repo:
                campaign_assets = self.asset_repo.get_by_campaign_id(session.campaign_id)

                # Generate presigned URLs in parallel (CPU-bound RSA-SHA1 CloudFront signing)
                # Lease deadline is stamped HERE, at signing time — the single timestamp the
                # expiry sweeper and the in-game countdown both reference. Timezone-aware so
                # its ISO form carries an explicit offset (naive strings parse as local in JS).
                if self.s3_service:
                    urls_expire_at = datetime.now(timezone.utc) + timedelta(seconds=self.s3_service.expiry)
                url_map = await self._generate_presigned_urls_parallel(campaign_assets)
                logger.info(f"Found {len(campaign_assets)} assets for campaign {session.campaign_id} with {len(url_map)} fresh URLs")

                # Build asset_id → asset aggregate lookup (single source of truth for warm-up)
                asset_lookup = {str(a.id): a for a in campaign_assets}

            # UX delay: Show "Starting" animation to users
            await asyncio.sleep(2)

            # 7. Build typed payload for api-game — restore state from the previous game
            audio_config_for_game = self._restore_audio_config(previous_game, asset_lookup, url_map)
            map_token_boards, map_token_seed = self._restore_map_token_state(previous_game, asset_lookup)
            map_config_for_game = self._restore_map_config(previous_game, asset_lookup, url_map)
            image_config_for_game = self._restore_image_config(previous_game, asset_lookup, url_map)
            session_users_for_game = self._build_session_users(session, campaign)
            # After the merge AND the roster: pc tokens re-stamp their avatar
            # refs before token_images collects ids (decision 39 — the board
            # scan below must see fresh refs, not the last game's).
            map_token_boards = self._stamp_pc_token_avatars(map_token_boards, session_users_for_game)
            dm_contract = DungeonMaster(
                user_id=str(campaign.dm_id),
                player_name=host_user.screen_name or "",  # screen_name only — never email (PII)
            )

            payload = SessionStartPayload(
                # The game's id IS the room id: api-game keys its document by
                # this, and the browser's /game?room_id= carries it.
                game_id=str(game.id),
                campaign_id=str(session.campaign_id),
                dungeon_master=dm_contract,
                # Seat count is a campaign setting, read fresh at every start —
                # so an edit made mid-game takes effect the next time it runs.
                max_players=campaign.max_players,
                # Campaign membership is the source of truth at start — keep this in lock-step with
                # the session_user DTOs (both from get_all_member_ids), not the frozen roster.
                joined_user_ids=[str(uid) for uid in campaign.get_all_member_ids()],
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
                audio_track_config=self._restore_audio_track_config(asset_lookup),
                spotify_state=(previous_game.spotify_config if previous_game else None) or {},
                map_config=map_config_for_game,
                image_config=image_config_for_game,
                active_display=(
                    ActiveDisplayType(previous_game.active_display)
                    if previous_game and previous_game.active_display else None
                ),
                adventure_log=(previous_game.adventure_log if previous_game else None) or [],
                map_token_state=map_token_boards,
                token_images=self._build_token_images(map_token_boards, session_users_for_game, asset_lookup, url_map),
                urls_expire_at=urls_expire_at.isoformat() if urls_expire_at else None,
            )

            # 8. Call api-game (synchronous await)
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

            # 9. Parse response. api-game keys the hot document by the game id we
            # sent, and every later hot call addresses it that way — so a
            # mismatch here would silently break player sync and cleanup.
            start_response = SessionStartResponse(**response.json())
            if start_response.game_id != str(game.id):
                raise ValueError(
                    f"api-game returned game id {start_response.game_id}, "
                    f"expected {game.id}"
                )

            # 10. Mark ACTIVE, stamping the seed the boards actually started from
            # (decision 24 — the merge's diff base for the NEXT game).
            game.activate(urls_expire_at, map_token_seed)
            self.game_repo.save(game)

            logger.info(f"Game {game.id} ACTIVE")

        except Exception as e:
            # ANY error before ACTIVE removes the row. There is nothing to roll
            # back to: an unstarted game is not history, and a STARTING row left
            # behind would block the next start through the one-open-game index.
            logger.error(f"Unexpected error starting game {game.id} for session {session_id}: {e}")
            self.game_repo.delete(game.id)
            logger.info(f"Game {game.id} removed after failed start")
            raise ValueError(f"Failed to start game: {str(e)}")

        # The start has succeeded — everything below is side effects. Failures
        # here are logged and swallowed: they must never undo an ACTIVE game or
        # make a successful start report as failed.
        try:
            # 11. The planned name now belongs to the game, so the session stops
            # holding it. This is one of only two session writes in this module.
            if session.next_game_name:
                session.consume_next_game_name()
                self.session_repo.save(session)

            # 12. Stamp the campaign as played, then broadcast session_started to
            # all campaign members + DM (with notification)
            campaign = self.campaign_repo.get_by_id(session.campaign_id)
            if campaign:
                campaign.mark_played()
                self.campaign_repo.save(campaign)

                # Include DM in recipient list (DM gets confirmation toast)
                all_recipients = campaign.get_all_member_ids()

                events = SessionEvents.session_started(
                    campaign_member_ids=all_recipients,
                    session_id=session.id,
                    game_id=game.id,
                    game_name=game.name,
                    campaign_id=session.campaign_id,
                    campaign_name=campaign.title,
                    host_id=host_id,
                    host_screen_name=host_user.screen_name or "Unknown"  # never email (PII)
                )

                # Broadcast to each recipient
                for event_config in events:
                    await self.event_manager.broadcast(event_config)

                logger.info(f"Broadcasting session_started event to {len(all_recipients)} recipients for game {game.id}")
        except Exception as side_effect_error:
            logger.warning(
                f"Game {game.id} started, but a post-start side effect failed "
                f"(name consumption, last_played stamp or session_started broadcast): {side_effect_error}"
            )

        return game


# === Shared ETL helpers for taking a game down (hot → cold) ===

@dataclass
class _ExtractedGameState:
    """State extracted from MongoDB during the take-down ETL (hot → cold).

    Deliberately does NOT carry the seat count: it is campaign settings, owned
    cold and pushed hot at start. Reading it back would let the running game
    overwrite an edit the GM made in settings while it was live.

    attendance is extracted here but recorded separately on the game: it is the
    record of a night rather than state the next game reads.
    """
    audio_config: dict
    spotify_config: dict
    map_config: dict
    image_config: dict
    active_display: Optional[str]
    adventure_log: list
    map_token_state: dict
    attendance: List[Attendee] = field(default_factory=list)


def _build_attendance(players) -> List[Attendee]:
    """Who was at the table, from api-game's final player list.

    De-duplicated by user id, first occurrence wins: a player who took two seats
    over an evening is still one person who was there. Order is api-game's,
    which is the order players joined the room.
    """
    attendance = []
    seen_user_ids = set()
    for player in players:
        if not player.user_id or player.user_id in seen_user_ids:
            continue
        seen_user_ids.add(player.user_id)
        attendance.append(
            Attendee(
                user_id=UUID(player.user_id),
                character_id=UUID(player.character_id) if player.character_id else None,
            )
        )
    return attendance


async def _extract_and_sync_game_state(
    game: GameAggregate,
    asset_repo: MediaAssetRepository,
    game_repo: GameRepository,
    character_repo: CharacterRepository = None
) -> _ExtractedGameState:
    """
    PHASE 1 of the take-down ETL: fetch final state from MongoDB and sync asset configs to PostgreSQL.

    1. Fetches final state from api-game (non-destructive, validate_only=True)
    2. Syncs per-asset volumes/effects back to PostgreSQL asset records
    3. Syncs character colors back to PostgreSQL character records
    4. Extracts thin config references (+ adventure log + attendance) for the game row

    On failure, rolls the game back to ACTIVE via abort_end() and raises ValueError.
    """
    game_id = game.id
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "http://api-game:8081/game/session/end",
                params={"validate_only": True},
                json={"game_id": str(game_id)},
                timeout=10.0
            )

        if response.status_code != 200:
            logger.error(f"Failed to fetch final state: {response.text}")
            raise ValueError(f"Cannot fetch game state: {response.text}")

        end_response = SessionEndResponse(**response.json())
        final_state = end_response.final_state
        logger.info(f"Fetched final state for game {game_id}: {len(final_state.players)} players")

        # Collect per-asset audio settings from BOTH active channels AND stashed track configs.
        # Uses a common shape: {volume, looping, effects} — channel state always has values,
        # track config has Optional fields (None = don't override).
        asset_audio_settings = {}
        for channel_id, channel in final_state.audio_state.items():
            if channel and channel.asset_id:
                asset_audio_settings[channel.asset_id] = {
                    "volume": channel.volume,
                    "looping": channel.looping,
                    "effects": channel.effects,
                }
        for asset_id_str, track_config in final_state.audio_track_config.items():
            if asset_id_str not in asset_audio_settings:
                asset_audio_settings[asset_id_str] = {
                    "volume": track_config.volume,
                    "looping": track_config.looping,
                    "effects": track_config.effects,
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

        # Sync character colors back to PostgreSQL (ETL: hot → cold). Color is
        # character-owned: the hot game carries it on player_metadata and the
        # character row is its durable home — the seat never stores it.
        if character_repo:
            synced_colors = 0
            for player in final_state.players:
                if not player.character_id or player.color is None:
                    continue
                try:
                    character = character_repo.get_by_id(UUID(player.character_id))
                    if character and character.color != player.color:
                        character.set_color(player.color)
                        character_repo.save(character)
                        synced_colors += 1
                except Exception as e:
                    logger.warning(f"Failed to sync color for character {player.character_id}: {e}")
            logger.info(f"Synced {synced_colors} character colors to PostgreSQL")

        # Thin JSONB: store only channel → asset_id references (all config synced back to assets above)
        audio_config = {}
        for channel_id, channel in final_state.audio_state.items():
            if channel and channel.asset_id:
                audio_config[channel_id] = {"asset_id": channel.asset_id}
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

        # Extract image config (asset_id + display config for cold persistence)
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

        # Extract Spotify BGM block (typed SpotifyState contract; stored as JSONB on the game)
        spotify_config = final_state.spotify_state.model_dump()
        logger.info(f"Extracted spotify config: {'has track' if spotify_config.get('track_uri') else 'empty'}")

        # Adventure log travels whole (bounded: api-game caps it at 200 lines/room)
        adventure_log = [entry.model_dump() for entry in final_state.adventure_log]
        logger.info(f"Extracted adventure log: {len(adventure_log)} entries")

        # Token boards travel whole (tiny: a handful of ~10-field discs per map)
        map_token_state = {}
        for board_asset_id, board_tokens in final_state.map_token_state.items():
            map_token_state[board_asset_id] = [board_token.model_dump() for board_token in board_tokens]
        logger.info(f"Extracted map token state: {len(map_token_state)} board(s)")

        attendance = _build_attendance(final_state.players)
        logger.info(f"Extracted attendance: {len(attendance)} player(s) at the table")

        return _ExtractedGameState(
            audio_config=audio_config,
            spotify_config=spotify_config,
            map_config=map_config,
            image_config=image_config,
            active_display=active_display,
            adventure_log=adventure_log,
            map_token_state=map_token_state,
            attendance=attendance,
        )

    except Exception as e:
        # ANY error during state fetch - rollback to ACTIVE
        logger.error(f"Error fetching state for game {game_id}: {e}")
        game.abort_end()  # Domain method: ENDING → ACTIVE
        game_repo.save(game)
        logger.info(f"Game {game_id} rolled back to ACTIVE after error")
        raise ValueError(f"Cannot complete the take-down: {str(e)}")


# Backoff for the phase-2 PostgreSQL write, seconds between attempts.
# Fibonacci by decree, hardcoded by common sense.
PHASE2_RETRY_DELAYS_SECONDS = [1, 2, 3]


async def _save_game_with_retry(game_repo: GameRepository, game: GameAggregate) -> Optional[Exception]:
    """Attempt the phase-2 save, retrying through the backoff before giving up.

    The extracted state and terminal status are already on the aggregate, so
    each retry re-attempts the same single-commit write. Transient database
    blips heal invisibly here — the game stays truthfully ENDING while the
    system keeps trying, instead of surfacing a retry loop to the user.

    Returns None on success, or the final error once the delays are exhausted.
    """
    attempt_delays = [0] + PHASE2_RETRY_DELAYS_SECONDS
    last_error = None
    for attempt_number, delay_seconds in enumerate(attempt_delays, start=1):
        if delay_seconds:
            await asyncio.sleep(delay_seconds)
        try:
            game_repo.save(game)
            if attempt_number > 1:
                logger.info(f"Phase-2 save for game {game.id} succeeded on attempt {attempt_number}")
            return None
        except Exception as save_error:
            last_error = save_error
            # A failed commit poisons the SQLAlchemy session until rollback.
            game_repo.db.rollback()
            logger.warning(
                f"Phase-2 save attempt {attempt_number} failed for game {game.id}: {save_error}"
            )
    return last_error


def _abort_stuck_end(game_repo: GameRepository, game_id: UUID) -> bool:
    """Best-effort ENDING → ACTIVE rollback after phase 2 exhausted its retries.

    Runs on a freshly fetched aggregate: the in-memory one already carries the
    phase-2 payload and terminal status, and a rollback must not write any of
    that. ACTIVE is true at this point — the room still exists, because phase-3
    cleanup only ever runs after a successful phase 2.
    """
    try:
        fresh_game = game_repo.get_by_id(game_id)
        fresh_game.abort_end()
        game_repo.save(fresh_game)
        logger.error(f"Game {game_id} rolled back to ACTIVE after phase-2 write failures")
        return True
    except Exception as abort_error:
        logger.critical(
            f"Game {game_id} STUCK at ENDING: the phase-2 write failed and the "
            f"rollback to ACTIVE also failed: {abort_error}"
        )
        return False


async def _async_cleanup_game(game_id: UUID):
    """
    Background task to delete the hot room in MongoDB (fire-and-forget).

    api-game keys the room by the game's id, so that id addresses it.
    If this fails, the hourly cron job will clean up orphaned rooms.
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.delete(
                f"http://api-game:8081/game/session/{game_id}",
                params={"keep_logs": False},
                timeout=5.0
            )

        if response.status_code == 200:
            logger.info(f"Background cleanup successful for game {game_id}")
        else:
            logger.warning(f"MongoDB cleanup failed for {game_id}: {response.text}")
            logger.warning(f"Cron job will clean up the room for game {game_id}")

    except Exception as e:
        logger.warning(f"Background cleanup failed for {game_id}: {e}")
        logger.warning(f"Cron job will clean up the room for game {game_id}")


class EndGame:
    """
    Take a running game down: ACTIVE → ENDING → ENDED (three-phase fail-safe).

    One command, two callers, told apart by EndReason: the host pressing End
    game, and the system closing an abandoned game (expiry sweeper, admin CLI).
    They share every step — the difference is only what the players are told and
    whether the schedule clears, so a single ETL serves both rather than two
    near-copies drifting apart.

    Three-phase pattern ensures data preservation:
    1. Fetch final state from MongoDB (non-destructive)
    2. Write to PostgreSQL (with retry, rolling back to ACTIVE if it fails)
    3. Delete the MongoDB room (background cleanup)
    """

    def __init__(
        self,
        game_repository: GameRepository,
        session_repository: SessionRepository,
        user_repository: UserRepository,
        character_repository,
        campaign_repository: CampaignRepository,
        event_manager: EventManager,
        asset_repository: MediaAssetRepository = None
    ):
        self.game_repo = game_repository
        self.session_repo = session_repository
        self.user_repo = user_repository
        self.character_repo = character_repository
        self.campaign_repo = campaign_repository
        self.event_manager = event_manager
        self.asset_repo = asset_repository

    async def execute(
        self,
        game_id: UUID,
        host_id: UUID,
        reason: EndReason,
        name: Optional[str] = None,
        summary: Optional[str] = None,
    ) -> GameAggregate:
        """
        End the game using the fail-safe three-phase pattern.

        Args:
            reason: HOST when the host pressed End game, SYSTEM when the sweeper
                or an admin closed it. Required rather than defaulted — every
                call site states which it is, because the choice decides whether
                players hear about it and whether the schedule clears.
            name, summary: the GM's record of the night, offered in the End
                dialog. Both optional and never blocking; a caller that passes
                neither leaves what the game already had.

        Raises:
            ValueError: If validation fails or the api-game call fails
        """
        # 1. Load and validate the game
        game = self.game_repo.get_by_id(game_id)
        if not game:
            raise ValueError("Game not found")
        if game.host_id != host_id:
            raise ValueError("Only the host can end the game")
        if game.status != GameStatus.ACTIVE:
            raise ValueError(f"Cannot end a game in {game.status} status")

        # 2. Set ENDING status
        game.begin_end()
        self.game_repo.save(game)
        logger.info(f"Game {game_id} status set to ENDING")

        # 3. PHASE 1: Extract and sync state from MongoDB
        extracted = await _extract_and_sync_game_state(
            game, self.asset_repo, self.game_repo, self.character_repo
        )

        # 4. PHASE 2: Write to PostgreSQL — one commit carrying the state this
        # game ended with, its record, and the ENDED transition, retried through
        # the backoff. If every attempt fails, roll back to ACTIVE: the room is
        # still hot (phase-3 cleanup only runs after a successful write), so
        # ending can simply be attempted again.
        game.record_end_state(extracted)
        game.end(reason, extracted.attendance)
        if name is not None:
            game.rename(name)
        if summary is not None:
            game.summarise(summary)

        save_error = await _save_game_with_retry(self.game_repo, game)
        if save_error:
            logger.error(f"PostgreSQL write failed for game {game_id} after retries: {save_error}")
            if _abort_stuck_end(self.game_repo, game_id):
                raise ValueError(
                    f"Failed to end the game — it is still live and can be "
                    f"ended again. Error: {str(save_error)}"
                )
            raise ValueError(
                f"Failed to end the game and it could not be returned to live. "
                f"Game preserved in MongoDB — needs admin attention. Error: {str(save_error)}"
            )
        logger.info(f"Game {game_id} marked ENDED in PostgreSQL")

        session = self.session_repo.get_by_id(game.session_id)

        # 5. The host's game just happened, so the date stops being "next". A
        # SYSTEM take-down leaves it alone: the sweeper closing a forgotten game
        # says nothing about what the GM told the table. This is the only thing
        # ending ever writes to the session, and it is not play state.
        if reason is EndReason.HOST and session and session.scheduled_at:
            session.clear_schedule()
            self.session_repo.save(session)
            logger.info(f"Cleared the next-game date on session {game.session_id}")

        # 6. Tell the campaign — the ONE place the two reasons diverge.
        campaign = self.campaign_repo.get_by_id(game.campaign_id)
        if campaign:
            host_user = self.user_repo.get_by_id(host_id)
            host_screen_name = (host_user.screen_name if host_user else None) or "Unknown"  # never email (PII)
            all_recipients = campaign.get_all_member_ids()

            if reason is EndReason.HOST:
                events = SessionEvents.session_ended(
                    campaign_member_ids=all_recipients,
                    session_id=game.session_id,
                    game_id=game.id,
                    game_name=game.name,
                    campaign_id=game.campaign_id,
                    campaign_name=campaign.title,
                    host_id=host_id,
                    host_screen_name=host_screen_name
                )
            else:
                events = SessionEvents.session_paused(
                    campaign_member_ids=all_recipients,
                    session_id=game.session_id,
                    game_id=game.id,
                    game_name=game.name,
                    campaign_id=game.campaign_id,
                    paused_by_id=host_id,
                    paused_by_screen_name=host_screen_name
                )

            for event_config in events:
                await self.event_manager.broadcast(event_config)
            logger.info(
                f"Broadcast {reason} take-down to {len(events)} recipient(s) for game {game.id}"
            )

        # 7. PHASE 3: Background cleanup (fire-and-forget)
        asyncio.create_task(_async_cleanup_game(game_id))

        logger.info(f"Game {game_id} ended ({reason}) successfully, cleanup scheduled")
        return game


class UpdateGame:
    """Edit a game's record: what it was called and what happened.

    Legal in any status. A GM names the night as it ends, and corrects it weeks
    later from the campaign drawer — both go through here.
    """

    def __init__(self, game_repository: GameRepository):
        self.game_repo = game_repository

    def execute(
        self,
        game_id: UUID,
        host_id: UUID,
        name: Optional[str] = None,
        summary: Optional[str] = None,
    ) -> GameAggregate:
        """Apply the fields that were sent.

        None means "leave it alone" and an empty string means "clear it" — the
        aggregate's trim-to-None does the clearing, so the two are distinct all
        the way from the request body.

        Raises:
            ValueError: game missing, caller is not the host, or the name is too long.
        """
        game = self.game_repo.get_by_id(game_id)
        if not game:
            raise ValueError("Game not found")
        if game.host_id != host_id:
            raise ValueError("Only the host can edit the game")

        if name is not None:
            game.rename(name)
        if summary is not None:
            game.summarise(summary)

        self.game_repo.save(game)
        return game


class DisconnectFromGame:
    """Handle player disconnect from a running game (character-level ETL).

    Called by api-game when a player's socket closes, not by a browser. It moves
    ONE player's runtime state to their own character row — which is where run
    data on a user-owned object belongs: not on the game (whose cold state is the
    board, the log and the screen) and not on the session's party (which records
    which character someone brought, not that character's condition).
    """

    def __init__(
        self,
        game_repository: GameRepository,
        character_repository: CharacterRepository
    ):
        self.game_repo = game_repository
        self.character_repo = character_repository

    def execute(
        self,
        game_id: UUID,
        user_id: UUID,
        character_id: UUID,
        character_state: dict
    ) -> CharacterAggregate:
        """
        Save character state when a player disconnects from a running game.

        Business rules:
        - A game must be running
        - Character must be owned by user
        - Character must be locked to the game's campaign

        character_state structure:
        {
            "current_hp": int,
            "current_position": {"x": int, "y": int},
            "status_effects": [...],
            ... other game-specific state
        }
        """
        game = self.game_repo.get_by_id(game_id)
        if not game:
            raise ValueError(f"Game {game_id} not found")

        if game.status != GameStatus.ACTIVE:
            raise ValueError("No game is running")

        character = self.character_repo.get_by_id(character_id)
        if not character:
            raise ValueError(f"Character {character_id} not found")

        if not character.is_owned_by(user_id):
            raise ValueError("Character not owned by user")

        # The campaign is read off the game's own denormalised column — no
        # session load needed for a check about which table this character sits at.
        if character.active_campaign != game.campaign_id:
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

        logger.info(f"Character-level ETL complete for character {character_id} in game {game_id}")

        return character
