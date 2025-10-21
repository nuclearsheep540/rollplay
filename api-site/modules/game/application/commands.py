# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from uuid import UUID
from modules.game.repositories.game_repository import GameRepository
from modules.user.orm.user_repository import UserRepository
from modules.characters.orm.character_repository import CharacterRepository
from modules.campaign.orm.campaign_repository import CampaignRepository
from modules.game.domain.game_aggregate import GameAggregate


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
        host_id: UUID
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
        game = GameAggregate.create(name=name, campaign_id=campaign_id, host_id=host_id)

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
