#!/usr/bin/env python3
"""Script to fix games stuck in starting status."""

from models.base import get_db
from repositories.game_repository import GameRepository
from commands.migration_commands import MigrationCommands
from repositories.campaign_repository import CampaignRepository
from enums.game_status import GameStatus
from datetime import datetime

def fix_stuck_games():
    """Fix games stuck in starting status by rolling them back to inactive."""
    
    # Get database session
    db = next(get_db())
    
    try:
        # Create repositories and commands
        game_repo = GameRepository(db)
        campaign_repo = CampaignRepository(db)
        migration_commands = MigrationCommands(campaign_repo, game_repo)
        
        # Find games stuck in starting status (more than 1 minute ago)
        stuck_games = game_repo.get_stuck_games(GameStatus.STARTING, minutes_ago=1)
        
        print(f"Found {len(stuck_games)} games stuck in STARTING status")
        
        for game in stuck_games:
            minutes_stuck = (datetime.utcnow() - game.last_activity_at).total_seconds() / 60
            print(f"Fixing game {game.id} (stuck for {minutes_stuck:.1f} minutes)")
            
            # Attempt rollback
            try:
                success = migration_commands.rollback_failed_migration(game.id)
                if success:
                    print(f"✅ Successfully rolled back game {game.id}")
                else:
                    print(f"❌ Failed to rollback game {game.id}")
            except Exception as e:
                print(f"❌ Error rolling back game {game.id}: {e}")
        
        # Verify the fix
        remaining_stuck = game_repo.get_stuck_games(GameStatus.STARTING, minutes_ago=1)
        print(f"\nAfter cleanup: {len(remaining_stuck)} games still stuck")
        
    finally:
        db.close()

if __name__ == "__main__":
    fix_stuck_games()