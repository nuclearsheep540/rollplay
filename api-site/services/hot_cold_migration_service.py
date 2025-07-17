# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import Dict, Any, Optional
from uuid import UUID
import asyncio
import logging

from repositories.campaign_repository import CampaignRepository
from repositories.game_repository import GameRepository
from commands.migration_commands import MigrationCommands
from enums.game_status import GameStatus


logger = logging.getLogger(__name__)


class HotColdMigrationService:
    """Service for orchestrating hot/cold storage migrations."""
    
    def __init__(
        self, 
        campaign_repo: CampaignRepository, 
        game_repo: GameRepository,
        migration_commands: MigrationCommands
    ):
        self.campaign_repo = campaign_repo
        self.game_repo = game_repo
        self.migration_commands = migration_commands
    
    def start_game_session(self, campaign_id: UUID, session_config: Dict[str, Any]) -> Dict[str, Any]:
        """Start a game session by migrating campaign to hot storage."""
        
        logger.info(f"Starting game session for campaign {campaign_id}")
        
        try:
            # 1. Get the game for this campaign (one-to-one relationship)
            game = self.game_repo.get_by_campaign_id(campaign_id)
            if not game:
                raise ValueError(f"No game found for campaign {campaign_id}")
            
            # 2. Validate game state
            if game.status != GameStatus.INACTIVE:
                raise ValueError(f"Game not in inactive state. Current status: {game.status}")
            
            # 3. Set game to 'starting' state (locks campaign configuration)
            game = self.game_repo.update_status(game.id, GameStatus.STARTING)
            if not game:
                raise RuntimeError("Failed to update game status to starting")
            
            # 4. Get campaign data for migration
            campaign_data = self.campaign_repo.get_campaign_with_game_status(campaign_id)
            if not campaign_data or not campaign_data['can_configure']:
                self.game_repo.update_status(game.id, GameStatus.INACTIVE)  # Rollback
                raise ValueError("Campaign cannot be configured - game may be active")
            
            # 5. Migrate campaign data to MongoDB hot storage
            hot_storage_data = self.migration_commands.migrate_to_hot_storage(
                campaign_id, game.id
            )
            
            # 6. Validate migration success
            is_valid = self.migration_commands.validate_migration_integrity(
                game.id, hot_storage_data
            )
            if not is_valid:
                self.game_repo.update_status(game.id, GameStatus.INACTIVE)  # Rollback
                raise RuntimeError("Migration validation failed")
            
            # 7. TODO: Save hot storage data to MongoDB
            # This would be: await self.mongodb_client.save_active_session(hot_storage_data)
            
            # 8. Set game to 'active' state
            game = self.game_repo.update_status(game.id, GameStatus.ACTIVE)
            if not game:
                raise RuntimeError("Failed to update game status to active")
            
            logger.info(f"Game session started successfully: {game.id}")
            
            return {
                'game_id': game.id,
                'status': 'active',
                'hot_storage_data': hot_storage_data,
                'started_at': game.started_at
            }
            
        except Exception as error:
            logger.error(f"Game start failed for campaign {campaign_id}: {error}")
            
            # Attempt rollback
            try:
                if game:
                    self.migration_commands.rollback_failed_migration(game.id)
                    logger.info(f"Rollback successful for game {game.id}")
            except Exception as rollback_error:
                logger.error(f"Rollback failed for game {game.id}: {rollback_error}")
            
            raise error
    
    def end_game_session(self, game_id: UUID) -> Dict[str, Any]:
        """End a game session by migrating hot storage back to cold storage."""
        
        logger.info(f"Ending game session {game_id}")
        
        try:
            # 1. TODO: Get hot storage data from MongoDB
            # This would be: hot_storage_data = await self.mongodb_client.get_active_session(game_id)
            hot_storage_data = {}  # Placeholder
            
            if not hot_storage_data:
                raise ValueError(f"Game session {game_id} not found in hot storage")
            
            # 2. Validate game exists and is active
            game = self.game_repo.get_by_id(game_id)
            if not game:
                raise ValueError(f"Game {game_id} not found")
            
            if game.status != GameStatus.ACTIVE:
                raise ValueError(f"Game not in active state. Current status: {game.status}")
            
            # 3. Set game to 'stopping' state (prevents new operations)
            game = self.game_repo.update_status(game_id, GameStatus.STOPPING)
            if not game:
                raise RuntimeError("Failed to update game status to stopping")
            
            # 4. Migrate hot storage changes back to PostgreSQL
            migration_data = self.migration_commands.migrate_to_cold_storage(
                game_id, hot_storage_data
            )
            
            # 5. Update game record with final state
            updated_game = self.game_repo.update(migration_data['game'])
            if not updated_game:
                raise RuntimeError("Failed to update game with final state")
            
            # 6. Update campaign with persistent changes
            if migration_data['campaign']:
                self.campaign_repo.update(migration_data['campaign'])
            
            # 7. Validate cold storage migration
            is_valid = self._validate_cold_storage_migration(game_id, hot_storage_data)
            if not is_valid:
                logger.warning(f"Cold storage migration validation failed for game {game_id}")
            
            # 8. TODO: Delete hot storage (creates natural 404)
            # This would be: await self.mongodb_client.delete_active_session(game_id)
            
            logger.info(f"Game session ended successfully: {game_id}")
            
            return {
                'game_id': game_id,
                'status': 'ended',
                'campaign_id': migration_data['campaign_id'],
                'ended_at': updated_game.ended_at
            }
            
        except Exception as error:
            logger.error(f"Game end failed for session {game_id}: {error}")
            
            # Log error but don't rollback game state
            # Manual intervention may be required
            logger.error(f"Game end migration failed: {error}")
            raise error
    
    def validate_game_access(self, game_id: UUID) -> Dict[str, Any]:
        """Validate that a game can be accessed (hot storage exists)."""
        
        try:
            # TODO: Check if hot storage exists
            # hot_storage_exists = await self.mongodb_client.session_exists(game_id)
            hot_storage_exists = False  # Placeholder
            
            if not hot_storage_exists:
                return {'valid': False, 'reason': 'game_not_active'}
            
            # Get game data for validation
            game = self.game_repo.get_by_id(game_id)
            if not game:
                return {'valid': False, 'reason': 'game_not_found'}
            
            if game.status != GameStatus.ACTIVE:
                return {'valid': False, 'reason': 'game_not_active'}
            
            return {
                'valid': True,
                'game_id': game_id,
                'campaign_id': game.campaign_id,
                'status': game.status
            }
            
        except Exception as error:
            logger.error(f"Game access validation failed for {game_id}: {error}")
            return {'valid': False, 'reason': 'validation_error'}
    
    def _validate_cold_storage_migration(self, game_id: UUID, hot_storage_data: Dict[str, Any]) -> bool:
        """Validate that cold storage migration was successful."""
        
        try:
            # Get updated game state
            game = self.game_repo.get_by_id(game_id)
            if not game:
                return False
            
            # Check that essential data was preserved
            if game.status != GameStatus.INACTIVE:
                return False
            
            # Check that party data was preserved
            if not game.party and hot_storage_data.get('party'):
                return False
            
            # Check that adventure logs were preserved
            if not game.adventure_logs and hot_storage_data.get('adventure_logs'):
                return False
            
            return True
            
        except Exception:
            return False
    
