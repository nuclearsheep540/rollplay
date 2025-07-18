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
            
            # 3. Get campaign data for migration and validate BEFORE setting game to STARTING
            campaign_data = self.campaign_repo.get_campaign_with_game(campaign_id)
            if not campaign_data:
                raise ValueError(f"Campaign {campaign_id} not found or has been deleted")
            
            # Check if campaign has required data for game start
            campaign = campaign_data.get('campaign')
            if not campaign:
                raise ValueError(f"Campaign {campaign_id} data is incomplete - missing campaign information")
            
            # Check if campaign is properly configured
            if not campaign.is_configured:
                raise ValueError(f"Campaign {campaign_id} is not properly configured - must have a name and at least one invited player")
            
            # Check for conflicting active games (service layer logic) - check BEFORE setting to STARTING
            existing_game = campaign_data.get('game')
            if existing_game and existing_game.status in [GameStatus.ACTIVE.value, GameStatus.STARTING.value]:
                raise ValueError(f"Cannot start game - campaign already has an active game (status: {existing_game.status})")
            
            # 4. NOW set game to 'starting' state (locks campaign configuration) - only after all checks pass
            game = self.game_repo.update_status(game.id, GameStatus.STARTING)
            if not game:
                raise RuntimeError("Failed to update game status to starting")
            
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
            
            # 7. Save hot storage data to MongoDB via api-game
            import requests
            try:
                logger.info(f"Attempting to create MongoDB session for game {game.id}")
                
                # Remove the _id field - let MongoDB create its own ObjectId
                hot_storage_data_for_mongo = hot_storage_data.copy()
                hot_storage_data_for_mongo.pop('_id', None)
                
                # Add required MongoDB fields from session_config
                hot_storage_data_for_mongo['seat_colors'] = session_config.get('seat_colors', {
                    "0": "#3b82f6",
                    "1": "#ef4444", 
                    "2": "#22c55e",
                    "3": "#f97316",
                    "4": "#8b5cf6",
                    "5": "#f59e0b"
                })
                
                # Generate default seat_layout based on max_players
                max_players = session_config.get('max_players', 6)
                hot_storage_data_for_mongo['seat_layout'] = ["empty"] * max_players
                hot_storage_data_for_mongo['max_players'] = max_players
                
                # Add other required MongoDB fields
                hot_storage_data_for_mongo['dungeon_master'] = ""  # Will be set by game service
                hot_storage_data_for_mongo['room_host'] = ""  # Will be set by game service
                
                logger.info(f"Hot storage data for MongoDB: {hot_storage_data_for_mongo}")
                
                # POST to api-game to create new session (don't specify ID in URL)
                response = requests.post(
                    f"http://api-game:8081/game",
                    json=hot_storage_data_for_mongo,
                    headers={"Content-Type": "application/json"}
                )
                
                logger.info(f"API-game response: {response.status_code} - {response.text}")
                
                if response.status_code != 200:
                    self.game_repo.update_status(game.id, GameStatus.INACTIVE)  # Rollback
                    raise RuntimeError(f"Failed to create MongoDB session: {response.status_code} - {response.text}")
                    
                # Get the MongoDB ObjectId from the response
                mongodb_response = response.json()
                mongodb_session_id = mongodb_response.get('id')
                
                if not mongodb_session_id:
                    self.game_repo.update_status(game.id, GameStatus.INACTIVE)  # Rollback
                    raise RuntimeError(f"No MongoDB session ID returned: {mongodb_response}")
                
                logger.info(f"MongoDB session created successfully with ID: {mongodb_session_id}")
                
                # Store the MongoDB session ID in the PostgreSQL game record
                from models.game import Game as GameModel
                db_game = self.game_repo.db.query(GameModel).filter(GameModel.id == game.id).first()
                if db_game:
                    db_game.mongodb_session_id = mongodb_session_id
                    self.game_repo.db.commit()
                    logger.info(f"Stored MongoDB session ID {mongodb_session_id} for game {game.id}")
                else:
                    logger.error(f"Could not find game {game.id} to store MongoDB session ID")
                
            except Exception as e:
                logger.error(f"Exception creating MongoDB session: {e}")
                self.game_repo.update_status(game.id, GameStatus.INACTIVE)  # Rollback
                raise RuntimeError(f"Failed to create MongoDB session: {e}")
            
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
            # 1. Get the game and its MongoDB session ID
            from models.game import Game as GameModel
            db_game = self.game_repo.db.query(GameModel).filter(GameModel.id == game_id).first()
            if not db_game or not db_game.mongodb_session_id:
                raise ValueError(f"Game session {game_id} not found in hot storage")
                
            mongodb_session_id = db_game.mongodb_session_id
            logger.info(f"Found MongoDB session ID: {mongodb_session_id} for game {game_id}")
            
            # 2. Get hot storage data from MongoDB via api-game
            import requests
            try:
                response = requests.get(f"http://api-game:8081/game/{mongodb_session_id}")
                if response.status_code != 200:
                    raise ValueError(f"MongoDB session {mongodb_session_id} not found: {response.status_code}")
                    
                hot_storage_data = response.json()
                logger.info(f"Retrieved hot storage data for session {mongodb_session_id}")
                
            except Exception as e:
                raise ValueError(f"Failed to retrieve hot storage data: {e}")
            
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
    
