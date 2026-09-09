# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Expired-game cleanup — a periodic background job that ends games whose signed-URL
lease has lapsed, so abandoned games don't linger with dead assets.

The deadline (games.urls_expire_at) is stamped by StartGame at URL-signing time
and lives in PostgreSQL, so this job holds no state: a restart loses nothing and
the first pass after boot catches anything that expired during downtime (the
query is "past due", not "fires at the moment"). Each due game is closed via the
existing EndGame command, acting as its host.

The first pass also reconciles games stranded at ENDING: that state is transient
by design (an ETL in flight), so a row still holding it at boot means a process
death interrupted a take-down. The room is still hot in MongoDB — phase-3 cleanup
only runs after a successful cold write — so rolling the game back to ACTIVE is
true, and the lease sweep can then end it properly. Safe at boot only: a
single-instance service has no in-flight ETLs at startup.

Started as a single asyncio task from the FastAPI lifespan handler in main.py.
"""

import asyncio
import logging
from contextlib import suppress
from datetime import datetime, timezone

from config.settings import Settings
from shared.dependencies.db import SessionLocal
from modules.game.application.commands import EndGame
from modules.game.domain.game_aggregate import EndReason
from modules.game.repositories.game_repository import GameRepository
from modules.session.repositories.session_repository import SessionRepository
from modules.user.repositories.user_repository import UserRepository
from modules.campaign.repositories.campaign_repository import CampaignRepository
from modules.library.repositories.asset_repository import MediaAssetRepository
from modules.events.repositories.notification_repository import NotificationRepository
from modules.events.websocket_manager import event_connection_manager
from modules.events.event_manager import EventManager

logger = logging.getLogger(__name__)
settings = Settings()


async def _run_cleanup_pass() -> None:
    db = SessionLocal()
    try:
        game_repo = GameRepository(db)
        expired = game_repo.get_expired_open_games(datetime.now(timezone.utc))
        if not expired:
            return

        logger.info(f"Expired-game cleanup: {len(expired)} game(s) past their URL lease")
        end_game = EndGame(
            game_repository=game_repo,
            session_repository=SessionRepository(db),
            user_repository=UserRepository(db),
            character_repository=None,  # the take-down doesn't use it
            campaign_repository=CampaignRepository(db),
            event_manager=EventManager(event_connection_manager, NotificationRepository(db), UserRepository(db)),
            asset_repository=MediaAssetRepository(db),
        )
        for game in expired:
            # Each game in its own try/except — one wedged game must not block the rest.
            # EndGame's ACTIVE-only guard raises ValueError if the game already left
            # ACTIVE (e.g. the host ended it between our query and this call); that's a
            # benign race, so log it quietly and reserve the traceback for genuinely
            # unexpected faults.
            try:
                # SYSTEM, not HOST: nobody chose this, so players are told nothing
                # and the schedule survives — the game simply reads as not running.
                await end_game.execute(game.id, host_id=game.host_id, reason=EndReason.SYSTEM)
                logger.info(f"Expired-game cleanup: game {game.id} ended")
            except ValueError as race:
                logger.info(f"Expired-game cleanup: skipped game {game.id} ({race})")
            except Exception:
                logger.exception(f"Expired-game cleanup: failed to end game {game.id}")
    finally:
        db.close()


def _reconcile_stuck_ending_games() -> None:
    """Boot-time pass: roll games stranded at ENDING back to ACTIVE."""
    db = SessionLocal()
    try:
        game_repo = GameRepository(db)
        stranded = game_repo.get_ending_games()
        for game in stranded:
            try:
                game.abort_end()
                game_repo.save(game)
                logger.warning(
                    f"Boot reconciliation: game {game.id} was stranded at ENDING "
                    f"(interrupted take-down) — rolled back to ACTIVE"
                )
            except Exception:
                logger.exception(f"Boot reconciliation: failed to roll back game {game.id}")
    finally:
        db.close()


async def run_expired_game_cleanup(stop_event: asyncio.Event) -> None:
    """Cleanup loop — sleeps between passes, exits promptly when stop_event is set."""
    interval = settings.EXPIRED_SESSION_CLEANUP_INTERVAL
    logger.info(f"Expired-game cleanup started (interval: {interval}s)")
    try:
        _reconcile_stuck_ending_games()
    except Exception:
        logger.exception("Boot reconciliation of ENDING games failed; continuing")
    while not stop_event.is_set():
        try:
            await _run_cleanup_pass()
        except Exception:
            logger.exception("Expired-game cleanup pass failed; retrying next interval")
        with suppress(asyncio.TimeoutError):
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
    logger.info("Expired-game cleanup stopped")
