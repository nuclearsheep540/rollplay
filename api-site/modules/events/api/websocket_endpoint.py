# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import WebSocket, WebSocketDisconnect
import asyncio
import logging
from datetime import datetime

from modules.events.websocket_manager import event_connection_manager
from shared.jwt_helper import JWTHelper
from shared.dependencies.db import get_db
from modules.user.orm.user_repository import UserRepository
from modules.user.application.queries import GetUserByEmail

logger = logging.getLogger(__name__)
jwt_helper = JWTHelper()


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

        db = next(get_db())
        user_repo = UserRepository(db)
        query = GetUserByEmail(user_repo)
        user = query.execute(email)

        if not user:
            await websocket.close(code=1008, reason="User not initialized")
            logger.warning(f"WebSocket connection rejected: User not found for email {email}")
            return

        user_id = str(user.id)

        await event_connection_manager.connect(websocket, user_id)

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
            await event_connection_manager.disconnect(websocket, user_id)
            logger.info(f"WebSocket disconnected for user {user_id}")
