# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from uuid import UUID
import httpx
import logging
import asyncio
from modules.game.repositories.game_repository import GameRepository
from modules.user.orm.user_repository import UserRepository
from modules.characters.orm.character_repository import CharacterRepository
from modules.campaign.orm.campaign_repository import CampaignRepository
from modules.game.domain.game_aggregate import GameAggregate, GameStatus

logger = logging.getLogger(__name__)


class CreateGame:
    """Create a new game within a campaign"""

    def __init__(
        self,
        game_repository: GameRepository,
        campaign_repository: CampaignRepository
    ):
        self.game_repo = game_repository
        self.campaign_repo = campaign_repository

    def execute(
        self,
        name: str,
        campaign_id: UUID,
        host_id: UUID,
        max_players: int = 8
    ) -> GameAggregate:
        """
        Create a new game and add it to the campaign.

        Cross-aggregate coordination:
        - Creates Game aggregate
        - Updates Campaign to include game_id
        """
        # Validate campaign exists and user is host
        campaign = self.campaign_repo.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        if not campaign.is_owned_by(host_id):
            raise ValueError("Only campaign host can create games")

        # Create game aggregate (host_id auto-inherited from campaign)
        game = GameAggregate.create(name=name, campaign_id=campaign_id, host_id=host_id, max_players=max_players)

        # Save game first to get ID
        self.game_repo.save(game)

        # Add game reference to campaign
        campaign.add_game(game.id)
        self.campaign_repo.save(campaign)

        return game


class InviteUserToGame:
    """Invite a user to join a game (select character later)"""

    def __init__(
        self,
        game_repository: GameRepository,
        user_repository: UserRepository
    ):
        self.game_repo = game_repository
        self.user_repo = user_repository

    def execute(
        self,
        game_id: UUID,
        user_id: UUID,
        invited_by: UUID
    ) -> GameAggregate:
        """
        Invite user to game.

        Validation:
        - User must exist (fail early for UX)
        - Only host can invite
        - Business rules in GameAggregate
        """
        # Validate user exists (fail early)
        user = self.user_repo.get_by_id(user_id)
        if not user:
            raise ValueError(f"User {user_id} not found")

        # Get game aggregate
        game = self.game_repo.get_by_id(game_id)
        if not game:
            raise ValueError(f"Game {game_id} not found")

        # Verify inviter is host
        if game.host_id != invited_by:
            raise ValueError("Only host can invite users")

        # Business logic in aggregate
        game.invite_user(user_id)

        # Persist
        self.game_repo.save(game)

        return game


class AcceptGameInvite:
    """User accepts invite by selecting a character"""

    def __init__(
        self,
        game_repository: GameRepository,
        user_repository: UserRepository,
        character_repository: CharacterRepository
    ):
        self.game_repo = game_repository
        self.user_repo = user_repository
        self.character_repo = character_repository

    def execute(
        self,
        game_id: UUID,
        user_id: UUID,
        character_id: UUID
    ) -> GameAggregate:
        """
        Accept invite with character selection.

        Cross-aggregate validation:
        - User must exist
        - Character must exist
        - Character must be owned by user
        - Business rules in GameAggregate
        """
        # Validate user exists
        user = self.user_repo.get_by_id(user_id)
        if not user:
            raise ValueError(f"User {user_id} not found")

        # Validate character exists
        character = self.character_repo.get_by_id(character_id)
        if not character:
            raise ValueError(f"Character {character_id} not found")

        # Validate character ownership
        if character.user_id != user_id:
            raise ValueError("Character not owned by user")

        # Get game aggregate
        game = self.game_repo.get_by_id(game_id)
        if not game:
            raise ValueError(f"Game {game_id} not found")

        # Business logic in aggregate
        game.accept_invite_with_character(user_id, character_id)

        # Persist
        self.game_repo.save(game)

        return game


class DeclineGameInvite:
    """User declines a game invite"""

    def __init__(
        self,
        game_repository: GameRepository,
        user_repository: UserRepository
    ):
        self.game_repo = game_repository
        self.user_repo = user_repository

    def execute(
        self,
        game_id: UUID,
        user_id: UUID
    ) -> GameAggregate:
        """Decline game invite."""
        # Validate user exists
        user = self.user_repo.get_by_id(user_id)
        if not user:
            raise ValueError(f"User {user_id} not found")

        # Get game aggregate
        game = self.game_repo.get_by_id(game_id)
        if not game:
            raise ValueError(f"Game {game_id} not found")

        # Business logic in aggregate
        game.decline_invite(user_id)

        # Persist
        self.game_repo.save(game)

        return game


class RemovePlayerFromGame:
    """Host removes a player character from the game"""

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
        character_id: UUID,
        removed_by: UUID
    ) -> GameAggregate:
        """
        Remove player character from game.

        Only host can remove players.
        """
        # Validate character exists
        character = self.character_repo.get_by_id(character_id)
        if not character:
            raise ValueError(f"Character {character_id} not found")

        # Get game aggregate
        game = self.game_repo.get_by_id(game_id)
        if not game:
            raise ValueError(f"Game {game_id} not found")

        # Verify remover is host
        if game.host_id != removed_by:
            raise ValueError("Only host can remove players")

        # Business logic in aggregate
        game.remove_player_character(character_id)

        # Persist
        self.game_repo.save(game)

        return game


class UpdateGame:
    """Update game details"""

    def __init__(self, game_repository: GameRepository):
        self.game_repo = game_repository

    def execute(
        self,
        game_id: UUID,
        host_id: UUID,
        name: str = None
    ) -> GameAggregate:
        """Update game details (only host can update)"""
        game = self.game_repo.get_by_id(game_id)
        if not game:
            raise ValueError(f"Game {game_id} not found")

        if game.host_id != host_id:
            raise ValueError("Only host can update game details")

        if name is not None:
            game.update_name(name)

        self.game_repo.save(game)
        return game


class DeleteGame:
    """Delete a game"""

    def __init__(
        self,
        game_repository: GameRepository,
        campaign_repository: CampaignRepository
    ):
        self.game_repo = game_repository
        self.campaign_repo = campaign_repository

    def execute(
        self,
        game_id: UUID,
        host_id: UUID
    ) -> bool:
        """
        Delete game and remove from campaign.

        Cross-aggregate coordination:
        - Deletes Game aggregate
        - Updates Campaign to remove game_id
        """
        game = self.game_repo.get_by_id(game_id)
        if not game:
            raise ValueError(f"Game {game_id} not found")

        if game.host_id != host_id:
            raise ValueError("Only host can delete game")

        # Get campaign to update
        campaign = self.campaign_repo.get_by_id(game.campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {game.campaign_id} not found")

        # Delete game (repository validates business rules)
        self.game_repo.delete(game_id)

        # Remove game reference from campaign
        campaign.remove_game(game_id)
        self.campaign_repo.save(campaign)

        return True


class StartGame:
    """
    Start game session: INACTIVE → STARTING → ACTIVE (synchronous).
    Creates MongoDB active_session via api-game service.
    """

    def __init__(
        self,
        game_repository: GameRepository,
        user_repository: UserRepository
    ):
        self.game_repo = game_repository
        self.user_repo = user_repository

    async def execute(self, game_id: UUID, host_id: UUID) -> GameAggregate:
        """
        Start a game session.

        Flow:
        1. Validates game ownership and status
        2. Sets game status to STARTING
        3. Calls api-game to create MongoDB active_session
        4. Sets game status to ACTIVE with session_id

        Raises:
            ValueError: If validation fails or api-game call fails
        """
        # 1. Load game
        game = self.game_repo.get_by_id(game_id)
        if not game:
            raise ValueError("Game not found")

        # 2. Validate host ownership
        if game.host_id != host_id:
            raise ValueError("Only the host can start this game")

        # 3. Validate game status
        if game.status != GameStatus.INACTIVE:
            raise ValueError(f"Cannot start game in {game.status} status")

        # 4. Set STARTING status
        game.start_game()  # Domain method sets status = STARTING
        self.game_repo.save(game)
        logger.info(f"Game {game_id} status set to STARTING")

        # 5. Get host user
        host_user = self.user_repo.get_by_id(host_id)
        if not host_user:
            # Rollback
            game.status = GameStatus.INACTIVE
            self.game_repo.save(game)
            raise ValueError("Host user not found")

        # Use screen_name if set, otherwise email
        dm_username = host_user.screen_name or host_user.email

        # 6. Build payload for api-game
        payload = {
            "game_id": str(game.id),
            "dm_username": dm_username,
            "max_players": game.max_players  # From game aggregate
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
                game.status = GameStatus.INACTIVE
                self.game_repo.save(game)
                raise ValueError(f"Failed to create session: {error_detail}")

            # 8. Parse response
            result = response.json()
            session_id = result["session_id"]

            # 9. Mark ACTIVE and store session_id
            game.mark_active()  # Sets ACTIVE, started_at = now
            game.session_id = session_id
            self.game_repo.save(game)

            logger.info(f"Game {game_id} ACTIVE with session {session_id}")
            return game

        except httpx.RequestError as e:
            # Network error calling api-game
            logger.error(f"Network error calling api-game: {e}")

            # Rollback to INACTIVE
            game.status = GameStatus.INACTIVE
            self.game_repo.save(game)
            raise ValueError(f"Cannot reach game service: {str(e)}")


class EndGame:
    """
    End game session: ACTIVE → STOPPING → INACTIVE (three-phase fail-safe).

    Three-phase pattern ensures data preservation:
    1. Fetch final state from MongoDB (non-destructive)
    2. Write to PostgreSQL (with transaction)
    3. Delete MongoDB session (background cleanup)
    """

    def __init__(
        self,
        game_repository: GameRepository,
        user_repository: UserRepository
    ):
        self.game_repo = game_repository
        self.user_repo = user_repository

    async def execute(self, game_id: UUID, host_id: UUID) -> GameAggregate:
        """
        End a game session using fail-safe three-phase pattern.

        Flow:
        1. Validates game ownership and status
        2. Sets game status to STOPPING
        3. PHASE 1: Fetch final state from MongoDB (validate_only=True, non-destructive)
        4. PHASE 2: Write to PostgreSQL (with transaction, fail-safe)
        5. PHASE 3: Background cleanup of MongoDB session (fire-and-forget)

        Raises:
            ValueError: If validation fails or api-game call fails
        """
        # 1. Load and validate game
        game = self.game_repo.get_by_id(game_id)
        if not game:
            raise ValueError("Game not found")

        # 2. Validate host ownership
        if game.host_id != host_id:
            raise ValueError("Only the host can end this game")

        # 3. Validate game status
        if game.status != GameStatus.ACTIVE:
            raise ValueError(f"Cannot end game in {game.status} status")

        # 4. Set STOPPING status
        game.stop_game()  # Domain method sets status = STOPPING
        self.game_repo.save(game)
        logger.info(f"Game {game_id} status set to STOPPING")

        # 5. PHASE 1: Fetch final state (MongoDB NOT deleted yet)
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "http://api-game:8081/game/session/end",
                    params={"validate_only": True},
                    json={"game_id": str(game_id)},
                    timeout=10.0
                )

            if response.status_code != 200:
                # Can't fetch state - rollback to ACTIVE
                logger.error(f"Failed to fetch final state: {response.text}")
                game.status = GameStatus.ACTIVE
                self.game_repo.save(game)
                raise ValueError(f"Cannot fetch game state: {response.text}")

            final_state = response.json()["final_state"]
            logger.info(f"✅ Fetched final state for {game_id}: {len(final_state.get('players', []))} players")

            # Extract max_players from MongoDB session stats
            max_players_from_session = final_state.get("session_stats", {}).get("max_players", game.max_players)
            logger.info(f"📊 Session max_players: {max_players_from_session} (original: {game.max_players})")

        except httpx.RequestError as e:
            # Network error - rollback to ACTIVE
            logger.error(f"Network error fetching state: {e}")
            game.status = GameStatus.ACTIVE
            self.game_repo.save(game)
            raise ValueError(f"Cannot reach game service: {str(e)}")

        # 6. PHASE 2: Write to PostgreSQL (with implicit transaction via repository)
        try:
            # Capture session_id BEFORE mark_inactive clears it
            session_id_to_cleanup = game.session_id

            # Update max_players from MongoDB session (if changed during session)
            game.max_players = max_players_from_session

            # Mark game INACTIVE (this will clear game.session_id to None)
            game.mark_inactive()  # Sets INACTIVE, stopped_at = now, session_id = None
            self.game_repo.save(game)
            logger.info(f"✅ Game {game_id} marked INACTIVE in PostgreSQL with max_players={max_players_from_session}")

        except Exception as pg_error:
            # PostgreSQL write failed - MongoDB session is PRESERVED
            logger.error(f"❌ PostgreSQL write failed for {game_id}: {pg_error}")
            logger.error(f"⚠️ MongoDB session {game.session_id} PRESERVED for manual retry")

            # Leave game in STOPPING status so user knows there's an issue
            # They can retry the end game operation
            raise ValueError(
                f"Failed to save game data. Session preserved in MongoDB. "
                f"Please try ending the game again. Error: {str(pg_error)}"
            )

        # 7. PHASE 3: Background cleanup (fire-and-forget)
        # This doesn't block the response - cleanup happens in background
        # Use captured session_id, not game.session_id (which is now None)
        asyncio.create_task(self._async_cleanup(game_id, session_id_to_cleanup))

        logger.info(f"✅ Game {game_id} ended successfully, cleanup scheduled")
        return game

    async def _async_cleanup(self, game_id: UUID, session_id: str):
        """
        Background task to delete MongoDB session.

        Doesn't block the response. If this fails, the hourly cron job
        will clean up orphaned sessions (games with status=INACTIVE and session_id set).
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.delete(
                    f"http://api-game:8081/game/session/{session_id}",
                    params={"keep_logs": True},  # Preserve adventure logs
                    timeout=5.0
                )

            if response.status_code == 200:
                # Success - clear session_id from PostgreSQL
                game = self.game_repo.get_by_id(game_id)
                if game:
                    game.session_id = None
                    self.game_repo.save(game)
                    logger.info(f"✅ Background cleanup complete for {game_id}")
            else:
                logger.warning(f"⚠️ MongoDB cleanup failed for {game_id}: {response.text}")
                logger.warning(f"Cron job will clean up session {session_id}")

        except Exception as e:
            # Cleanup failed - cron will handle it
            logger.warning(f"⚠️ Background cleanup failed for {game_id}: {e}")
            logger.warning(f"Cron job will clean up session {session_id}")
