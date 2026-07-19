# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Expired-session cleanup — a periodic background job that pauses sessions whose
signed-URL lease has lapsed, so abandoned games don't linger with dead assets.

The deadline (sessions.urls_expire_at) is stamped by StartSession at URL-signing
time and lives in PostgreSQL, so this job holds no state: a restart loses nothing
and the first pass after boot catches anything that expired during downtime (the
query is "past due", not "fires at the moment"). Each due session is closed via
the existing PauseSession command, acting as the session host.

Started as a single asyncio task from the FastAPI lifespan handler in main.py.
"""

import asyncio
import logging
from contextlib import suppress
from datetime import datetime, timezone

from config.settings import Settings
from shared.dependencies.db import SessionLocal
from modules.session.application.commands import PauseSession
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
        session_repo = SessionRepository(db)
        expired = session_repo.get_expired_sessions(datetime.now(timezone.utc))
        if not expired:
            return

        logger.info(f"Expired-session cleanup: {len(expired)} session(s) past their URL lease")
        pause = PauseSession(
            session_repository=session_repo,
            user_repository=UserRepository(db),
            character_repository=None,  # pause doesn't use it
            campaign_repository=CampaignRepository(db),
            event_manager=EventManager(event_connection_manager, NotificationRepository(db)),
            asset_repository=MediaAssetRepository(db),
        )
        for session in expired:
            # Each session in its own try/except — one wedged game must not block the rest.
            # PauseSession's ACTIVE-only guard raises ValueError if the session already left
            # ACTIVE (e.g. the host paused it between our query and this call); that's a benign
            # race, so log it quietly and reserve the traceback for genuinely unexpected faults.
            try:
                await pause.execute(session.id, host_id=session.host_id)
                logger.info(f"Expired-session cleanup: session {session.id} paused")
            except ValueError as race:
                logger.info(f"Expired-session cleanup: skipped session {session.id} ({race})")
            except Exception:
                logger.exception(f"Expired-session cleanup: failed to pause session {session.id}")
    finally:
        db.close()


async def run_expired_session_cleanup(stop_event: asyncio.Event) -> None:
    """Cleanup loop — sleeps between passes, exits promptly when stop_event is set."""
    interval = settings.EXPIRED_SESSION_CLEANUP_INTERVAL
    logger.info(f"Expired-session cleanup started (interval: {interval}s)")
    while not stop_event.is_set():
        try:
            await _run_cleanup_pass()
        except Exception:
            logger.exception("Expired-session cleanup pass failed; retrying next interval")
        with suppress(asyncio.TimeoutError):
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
    logger.info("Expired-session cleanup stopped")
