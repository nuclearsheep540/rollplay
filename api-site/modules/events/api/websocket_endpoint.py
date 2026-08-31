# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import WebSocket, WebSocketDisconnect
import asyncio
import logging
from datetime import datetime
from uuid import UUID

from modules.events.websocket_manager import event_connection_manager
from modules.events.event_manager import EventManager
from modules.events.repositories.notification_repository import NotificationRepository
from modules.friendship.domain.friendship_events import FriendshipEvents
from modules.friendship.repositories.friendship_repository import FriendshipRepository
from shared.jwt_helper import JWTHelper
from shared.dependencies.db import SessionLocal
from modules.user.repositories.user_repository import UserRepository
from modules.user.application.queries import GetUserByEmail

logger = logging.getLogger(__name__)
jwt_helper = JWTHelper()

PRESENCE_LOG_TAG = "PRESENCE"


async def _broadcast_presence(user_id: str, screen_name: str, came_online: bool):
    """
    Tell a user's accepted friends that they came online or went offline.

    Presence rides the existing per-user event socket: EventManager skips
    recipients who aren't connected, which is exactly the semantics presence
    wants — an offline friend has no presence to update.

    Failures are logged and swallowed: presence is ambient, and it must never
    take down the socket it is announcing.
    """
    subject_id = UUID(user_id)

    try:
        # Scoped tightly, like the auth lookup above — this runs on a socket that
        # stays open for hours and must not hold a pooled connection. The
        # EventManager is built inside the same scope, mirroring what the HTTP
        # provider (events/dependencies/providers.py) does per request.
        with SessionLocal() as db:
            friendships = FriendshipRepository(db).get_user_friendships(subject_id)

            friend_ids = []
            for friendship in friendships:
                friend_ids.append(friendship.get_other_user(subject_id))

            if not friend_ids:
                return

            if came_online:
                events = FriendshipEvents.friend_online(friend_ids, subject_id, screen_name)
            else:
                events = FriendshipEvents.friend_offline(friend_ids, subject_id, screen_name)

            # Presence never persists, so the notification repository goes
            # unused — but EventManager owns that decision via save_notification,
            # and handing it a real one keeps this identical to every other caller.
            event_manager = EventManager(event_connection_manager, NotificationRepository(db))
            for event in events:
                await event_manager.broadcast(event)

    except Exception as e:
        # Broad on purpose: presence is ambient and must never take down the
        # socket it is announcing. Logged at ERROR because nothing here is
        # expected to fail — a message on this line means a real defect.
        logger.error(f"{PRESENCE_LOG_TAG}: fan-out failed for user {user_id}: {e}", exc_info=True)


async def websocket_events_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for user event notifications.

    Authentication flow:
    1. Accept connection
    2. Wait for auth message with JWT token (5 second timeout)
    3. Validate token and get user email
    4. Query user from database (read-only, no create)
    5. Connect user to event stream
    6. Keep connection alive with ping/pong

    Args:
        websocket: FastAPI WebSocket instance
    """
    await websocket.accept()

    user_id = None
    screen_name = None

    try:
        auth_message = await asyncio.wait_for(
            websocket.receive_json(),
            timeout=5.0
        )

        if auth_message.get('event_type') != 'authenticate':
            await websocket.close(code=1008, reason="Authentication required")
            logger.warning("WebSocket connection rejected: No auth message")
            return

        token = auth_message.get('data', {}).get('token')
        if not token:
            await websocket.close(code=1008, reason="No token provided")
            logger.warning("WebSocket connection rejected: No token in auth message")
            return

        email = jwt_helper.verify_auth_token(token)
        if not email:
            await websocket.close(code=1008, reason="Invalid or expired token")
            logger.warning("WebSocket connection rejected: Invalid JWT token")
            return

        # Scoped tightly to the auth lookup: this socket stays open for hours, so it
        # must not pin a pooled connection for its lifetime. GetUserByEmail returns a
        # detached UserAggregate, so `user` is still usable once the session closes.
        with SessionLocal() as db:
            user_repo = UserRepository(db)
            query = GetUserByEmail(user_repo)
            user = query.execute(email)

        if not user:
            await websocket.close(code=1008, reason="User not initialized")
            logger.warning(f"WebSocket connection rejected: User not found for email {email}")
            return

        user_id = str(user.id)
        screen_name = user.screen_name or user.account_name or "A friend"

        came_online = await event_connection_manager.connect(websocket, user_id)

        await websocket.send_json({
            "event_type": "connected",
            "data": {
                "user_id": user_id,
                "message": "Event service connected"
            },
            "show_toast": False,
            "timestamp": datetime.utcnow().isoformat()
        })

        logger.info(f"WebSocket connected for user {user_id} ({email})")

        if came_online:
            await _broadcast_presence(user_id, screen_name, came_online=True)

        while True:
            try:
                message = await websocket.receive_json()

                if message.get("event_type") == "ping":
                    await websocket.send_json({
                        "event_type": "pong",
                        "timestamp": datetime.utcnow().isoformat()
                    })

            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.error(f"Error in WebSocket loop for user {user_id}: {e}")
                break

    except asyncio.TimeoutError:
        await websocket.close(code=1008, reason="Authentication timeout")
        logger.warning("WebSocket connection rejected: Authentication timeout (5 seconds)")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await websocket.close(code=1011, reason="Internal server error")
        except:
            pass
    finally:
        if user_id:
            went_offline = await event_connection_manager.disconnect(websocket, user_id)
            logger.info(f"WebSocket disconnected for user {user_id}")

            if went_offline:
                await _broadcast_presence(user_id, screen_name, came_online=False)
