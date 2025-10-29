#!/usr/bin/env python3
# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Cleanup orphaned MongoDB sessions hourly.

This script handles edge cases where the background cleanup task failed
(e.g., network issues, api-game downtime). It finds games marked INACTIVE
in PostgreSQL but still have session_id set, indicating the MongoDB session
wasn't properly cleaned up.

Runs independently via cron - NOT part of api-site.
"""

import os
import sys
import requests
import logging
from sqlalchemy import create_engine, text
from datetime import datetime, timedelta

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def get_database_url():
    """Build PostgreSQL connection URL from environment variables"""
    user = os.getenv("POSTGRES_USER", "postgres")
    password = os.getenv("POSTGRES_PASSWORD")
    host = os.getenv("POSTGRES_HOST", "postgres")
    port = os.getenv("POSTGRES_PORT", "5432")
    database = os.getenv("POSTGRES_DB", "rollplay")

    if not password:
        logger.error("POSTGRES_PASSWORD environment variable not set")
        sys.exit(1)

    return f"postgresql://{user}:{password}@{host}:{port}/{database}"


def get_api_game_url():
    """Get api-game service URL"""
    return os.getenv("API_GAME_URL", "http://api-game:8081")


def find_orphaned_games(engine):
    """
    Find games marked INACTIVE but still have session_id (orphaned).

    Only considers games that stopped more than 1 hour ago to avoid
    interfering with games that just ended and cleanup is still in progress.
    """
    try:
        with engine.connect() as conn:
            result = conn.execute(text("""
                SELECT id, session_id, stopped_at, name
                FROM games
                WHERE status = 'inactive'
                  AND session_id IS NOT NULL
                  AND stopped_at < :cutoff
            """), {"cutoff": datetime.utcnow() - timedelta(hours=1)})

            return result.fetchall()
    except Exception as e:
        logger.error(f"Failed to query orphaned games: {e}")
        return []


def cleanup_session(game_id, session_id, game_name, engine, api_game_url):
    """
    Delete MongoDB session and clear PostgreSQL reference.

    Returns:
        bool: True if cleanup succeeded, False otherwise
    """
    try:
        # Step 1: Delete from MongoDB via api-game
        delete_url = f"{api_game_url}/game/session/{session_id}"
        logger.info(f"Deleting MongoDB session for game '{game_name}' ({game_id})")

        response = requests.delete(delete_url, timeout=5.0)

        if response.status_code == 404:
            # Session already deleted from MongoDB - that's fine
            logger.info(f"MongoDB session {session_id} already deleted")
        elif response.status_code != 200:
            # Unexpected error from api-game
            logger.error(f"api-game returned {response.status_code} for {session_id}: {response.text}")
            return False
        else:
            logger.info(f"Successfully deleted MongoDB session {session_id}")

        # Step 2: Clear session_id from PostgreSQL
        with engine.connect() as conn:
            conn.execute(text("""
                UPDATE games
                SET session_id = NULL
                WHERE id = :game_id
            """), {"game_id": str(game_id)})
            conn.commit()
            logger.info(f"Cleared session_id from PostgreSQL for game {game_id}")

        logger.info(f"✅ Cleaned up orphaned session for game '{game_name}' ({game_id})")
        return True

    except requests.RequestException as e:
        logger.error(f"❌ Network error cleaning up {game_id}: {e}")
        return False
    except Exception as e:
        logger.error(f"❌ Failed to cleanup {game_id}: {e}")
        return False


def main():
    """Main cleanup routine"""
    logger.info("=" * 60)
    logger.info("Starting orphaned session cleanup")
    logger.info("=" * 60)

    # Get configuration
    database_url = get_database_url()
    api_game_url = get_api_game_url()

    # Create database engine
    try:
        engine = create_engine(database_url)
        logger.info(f"Connected to PostgreSQL at {database_url.split('@')[1]}")
    except Exception as e:
        logger.error(f"Failed to connect to PostgreSQL: {e}")
        sys.exit(1)

    # Find orphaned games
    orphaned = find_orphaned_games(engine)
    logger.info(f"Found {len(orphaned)} orphaned sessions")

    if len(orphaned) == 0:
        logger.info("No orphaned sessions found - all clean!")
        return

    # Cleanup each orphaned session
    success_count = 0
    for game in orphaned:
        if cleanup_session(
            game_id=game.id,
            session_id=game.session_id,
            game_name=game.name or "Unnamed Game",
            engine=engine,
            api_game_url=api_game_url
        ):
            success_count += 1

    # Summary
    logger.info("=" * 60)
    logger.info(f"Cleanup complete: {success_count}/{len(orphaned)} sessions cleaned")
    logger.info("=" * 60)

    # Exit with error code if any failures
    if success_count < len(orphaned):
        sys.exit(1)


if __name__ == "__main__":
    main()
