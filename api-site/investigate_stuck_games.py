#!/usr/bin/env python3
"""Script to investigate games stuck in starting status."""

from models.base import get_db
from repositories.game_repository import GameRepository
from enums.game_status import GameStatus
from datetime import datetime

def investigate_stuck_games():
    """Find and display information about games stuck in starting status."""
    
    # Get database session
    db = next(get_db())
    
    try:
        # Create repository
        game_repo = GameRepository(db)
        
        # Find games stuck in starting status (more than 1 minute ago)
        stuck_games = game_repo.get_stuck_games(GameStatus.STARTING, minutes_ago=1)
        
        print(f"Found {len(stuck_games)} games stuck in STARTING status:")
        print("-" * 60)
        
        for game in stuck_games:
            print(f"Game ID: {game.id}")
            print(f"Campaign ID: {game.campaign_id}")
            print(f"Name: {game.name}")
            print(f"Status: {game.status}")
            print(f"Created: {game.created_at}")
            print(f"Last Activity: {game.last_activity_at}")
            print(f"Started At: {game.started_at}")
            print(f"DM ID: {game.dm_id}")
            print("-" * 60)
            
        # Also check all games with STARTING status regardless of time
        all_starting_games = game_repo.get_by_status(GameStatus.STARTING)
        print(f"\nAll games with STARTING status: {len(all_starting_games)}")
        
        for game in all_starting_games:
            minutes_stuck = (datetime.utcnow() - game.last_activity_at).total_seconds() / 60
            print(f"Game {game.id}: stuck for {minutes_stuck:.1f} minutes")
            
    finally:
        db.close()

if __name__ == "__main__":
    investigate_stuck_games()