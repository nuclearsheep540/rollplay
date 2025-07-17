# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import Dict, Any, Optional
from uuid import UUID
from datetime import datetime
import json

from repositories.campaign_repository import CampaignRepository
from repositories.game_repository import GameRepository
from enums.game_status import GameStatus
from domain.campaign_domain import Campaign
from domain.game_domain import Game, Player


class MigrationCommands:
    """Commands for managing hot/cold storage migrations."""
    
    def __init__(self, campaign_repo: CampaignRepository, game_repo: GameRepository):
        self.campaign_repo = campaign_repo
        self.game_repo = game_repo
    
    def migrate_to_hot_storage(self, campaign_id: UUID, game_id: UUID) -> Dict[str, Any]:
        """Migrate campaign configuration to MongoDB hot storage."""
        
        # Get campaign domain object
        campaign = self.campaign_repo.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")
        
        # Get game domain object
        game = self.game_repo.get_by_id(game_id)
        if not game:
            raise ValueError(f"Game {game_id} not found")
        
        # Validate game is in correct state
        if game.status != GameStatus.STARTING:
            raise ValueError(f"Game must be in 'starting' state, currently: {game.status}")
        
        # Create initial party from invited players
        initial_party = []
        for invited_player in campaign.invited_players:
            player = Player(
                user_id=invited_player.user_id,
                character_id=invited_player.character_id,
                joined_at=invited_player.invited_at
            )
            initial_party.append(player)
        
        # Update game with initial party
        game.party = initial_party
        game.transition_to(GameStatus.ACTIVE)
        
        # Convert to hot storage format
        return game.to_hot_storage()
    
    def migrate_to_cold_storage(self, game_id: UUID, hot_storage_data: Dict[str, Any]) -> Dict[str, Any]:
        """Migrate hot storage state back to PostgreSQL cold storage."""
        
        # Validate hot storage data
        if not hot_storage_data:
            raise ValueError("Hot storage data is required for migration")
        
        if hot_storage_data.get('_id') != str(game_id):
            raise ValueError("Hot storage game ID mismatch")
        
        # Get current game state
        game = self.game_repo.get_by_id(game_id)
        if not game:
            raise ValueError(f"Game {game_id} not found")
        
        # Validate game is in correct state
        if game.status != GameStatus.STOPPING:
            raise ValueError(f"Game must be in 'stopping' state, currently: {game.status}")
        
        # Create game domain object from hot storage
        updated_game = Game.from_hot_storage(hot_storage_data)
        updated_game.transition_to(GameStatus.INACTIVE)
        
        # Update campaign with any changes that should persist
        campaign_id = UUID(hot_storage_data['campaign_id'])
        campaign = self.campaign_repo.get_by_id(campaign_id)
        if campaign:
            campaign.update_audio_config(hot_storage_data.get('audio_state', {}))
            campaign.update_media_config(hot_storage_data.get('media_state', {}))
            campaign.update_scenes_config(hot_storage_data.get('scene_presets', {}))
        
        return {
            'game': updated_game,
            'campaign': campaign,
            'campaign_id': campaign_id
        }
    
    
    def validate_migration_integrity(self, game_id: UUID, hot_storage_data: Dict[str, Any]) -> bool:
        """Validate that migration was successful."""
        try:
            # Check that game exists
            game = self.game_repo.get_by_id(game_id)
            if not game:
                return False
            
            # Check that campaign exists
            campaign = self.campaign_repo.get_by_id(game.campaign_id)
            if not campaign:
                return False
            
            # Check hot storage structure
            required_fields = ['_id', 'campaign_id', 'name', 'dm_id', 'party', 'moderators']
            for field in required_fields:
                if field not in hot_storage_data:
                    return False
            
            # Check ID consistency
            if hot_storage_data['_id'] != str(game_id):
                return False
            
            if hot_storage_data['campaign_id'] != str(game.campaign_id):
                return False
            
            return True
            
        except Exception:
            return False
    
    def rollback_failed_migration(self, game_id: UUID) -> bool:
        """Rollback a failed migration by resetting game to inactive state."""
        try:
            # Reset game status to inactive
            game = self.game_repo.update_status(game_id, GameStatus.INACTIVE)
            return game is not None
            
        except Exception:
            return False
    
    def cleanup_orphaned_hot_storage(self, game_id: UUID) -> bool:
        """Clean up orphaned hot storage entries."""
        # This would connect to MongoDB and delete the document
        # For now, we'll just validate the game state
        try:
            game = self.game_repo.get_by_id(game_id)
            if not game or game.status != GameStatus.ACTIVE:
                # Hot storage should be cleaned up
                return True
            return False
            
        except Exception:
            return False