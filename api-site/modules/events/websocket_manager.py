# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import WebSocket
from typing import Dict, Set, List
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class EventConnectionManager:
    """
    Manages per-user WebSocket connections for real-time event broadcasting.

    Unlike api-game's room-based manager, this manages connections per user.
    Supports multiple connections per user (multiple tabs/devices).
    """

    def __init__(self):
        self.user_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        """
        Register new WebSocket connection for user.

        NOTE: WebSocket must already be accepted by the endpoint before calling this.

        Args:
            websocket: FastAPI WebSocket instance (already accepted)
            user_id: User UUID as string
        """
        if user_id not in self.user_connections:
            self.user_connections[user_id] = set()

        self.user_connections[user_id].add(websocket)
        logger.info(f"User {user_id} connected (total connections: {len(self.user_connections[user_id])})")

    async def disconnect(self, websocket: WebSocket, user_id: str):
        """
        Remove WebSocket connection for user.

        Args:
            websocket: FastAPI WebSocket instance
            user_id: User UUID as string
        """
        if user_id in self.user_connections:
            self.user_connections[user_id].discard(websocket)

            if not self.user_connections[user_id]:
                del self.user_connections[user_id]

            logger.info(f"User {user_id} disconnected")

    async def send_to_user(self, user_id: str, message: dict):
        """
        Send event message to specific user (all their connections).

        Handles dead connections gracefully by removing them.

        Args:
            user_id: User UUID as string
            message: Event message dict (must include event_type, data, show_toast, timestamp)
        """
        if user_id not in self.user_connections:
            logger.debug(f"User {user_id} not connected, skipping event broadcast")
            return

        dead_connections = []
        for connection in self.user_connections[user_id]:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send to user {user_id}: {e}")
                dead_connections.append(connection)

        for dead in dead_connections:
            await self.disconnect(dead, user_id)

    async def broadcast_to_users(self, user_ids: List[str], message: dict):
        """
        Send event message to multiple users.

        Args:
            user_ids: List of user UUID strings
            message: Event message dict
        """
        for user_id in user_ids:
            await self.send_to_user(user_id, message)

    def is_user_connected(self, user_id: str) -> bool:
        """
        Check if user has any active connections.

        Args:
            user_id: User UUID as string

        Returns:
            True if user has at least one active connection
        """
        return user_id in self.user_connections and len(self.user_connections[user_id]) > 0

    def get_connected_user_count(self) -> int:
        """Get total number of connected users."""
        return len(self.user_connections)

    def get_total_connection_count(self) -> int:
        """Get total number of WebSocket connections across all users."""
        return sum(len(connections) for connections in self.user_connections.values())


event_connection_manager = EventConnectionManager()
