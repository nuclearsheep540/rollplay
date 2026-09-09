# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""A reconnect that lands while the old socket is closing must be left alone.

`player_disconnect` checks it is the user's CURRENT socket before tearing
anything down, but that check is made before an await — the adventure-log
write — and a handler suspends at every await. If the player reconnects in
that window, `room_users` comes to point at their new socket, and the
resumed handler would go on to move a player who is sitting right there to
the lobby, empty their seat and broadcast their departure to the room.

These tests drive that race deterministically: the log write itself performs
the reconnect, so the handler always resumes into the displaced state.
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from websocket_handlers.connection_manager import ConnectionManager
from websocket_handlers.websocket_events import WebsocketEvent

ROOM = "room-1"
USER = "alice"


class FakeWebSocket:
    """Stands in for a Starlette WebSocket — identity is all these tests use."""


def make_manager_with_connection():
    """A manager holding exactly one live connection for one user."""
    manager = ConnectionManager()
    socket = FakeWebSocket()
    manager.connections.append(socket)
    manager.room_users[ROOM] = {
        USER: {"websocket": socket, "is_in_party": True, "status": "connected"}
    }
    return manager, socket


def run_disconnect(manager, socket, reconnect_during_log_write):
    """Run the handler with its I/O stubbed.

    `reconnect_during_log_write` decides whether the awaited log write
    displaces the user's socket — i.e. whether they came back mid-teardown.
    """
    seat_layout = [USER, "empty"]
    game_service = MagicMock()
    game_service.get_seat_layout = AsyncMock(return_value=seat_layout)
    game_service.update_seat_layout = AsyncMock()

    async def add_log_entry(**kwargs):
        # The suspension point. A reconnect here is exactly the race.
        if reconnect_during_log_write:
            new_socket = FakeWebSocket()
            manager.connections.append(new_socket)
            manager.room_users[ROOM][USER]["websocket"] = new_socket
            manager.room_users[ROOM][USER]["status"] = "connected"

    log = MagicMock()
    log.add_log_entry = AsyncMock(side_effect=add_log_entry)

    with patch("websocket_handlers.websocket_events.adventure_log", log), \
         patch("websocket_handlers.websocket_events.GameService", game_service), \
         patch.object(WebsocketEvent, "_display_name", AsyncMock(return_value="Alice")):
        result = asyncio.run(WebsocketEvent.player_disconnect(
            websocket=socket, data={}, event_data={},
            user_id=USER, client_id=ROOM, manager=manager,
        ))
    return result, game_service


class TestAReconnectDuringTheTeardown:
    def test_the_live_player_keeps_their_seat(self):
        manager, socket = make_manager_with_connection()

        _, game_service = run_disconnect(manager, socket, reconnect_during_log_write=True)

        game_service.update_seat_layout.assert_not_called()

    def test_the_live_player_is_not_moved_to_the_lobby(self):
        manager, socket = make_manager_with_connection()

        run_disconnect(manager, socket, reconnect_during_log_write=True)

        assert manager.room_users[ROOM][USER]["is_in_party"] is True

    def test_no_departure_is_broadcast(self):
        manager, socket = make_manager_with_connection()

        result, _ = run_disconnect(manager, socket, reconnect_during_log_write=True)

        assert result.broadcast_message is None

    def test_the_new_socket_survives(self):
        manager, socket = make_manager_with_connection()

        run_disconnect(manager, socket, reconnect_during_log_write=True)

        assert manager.room_users[ROOM][USER]["websocket"] is not None
        assert manager.room_users[ROOM][USER]["websocket"] is not socket


class TestAnOrdinaryDisconnect:
    """The guard must not swallow a real departure."""

    def test_the_seat_is_cleared(self):
        manager, socket = make_manager_with_connection()

        _, game_service = run_disconnect(manager, socket, reconnect_during_log_write=False)

        game_service.update_seat_layout.assert_awaited_once_with(ROOM, ["empty", "empty"])

    def test_the_departure_is_broadcast(self):
        manager, socket = make_manager_with_connection()

        result, _ = run_disconnect(manager, socket, reconnect_during_log_write=False)

        assert result.broadcast_message["event_type"] == "player_disconnected"
        assert result.broadcast_message["data"]["disconnected_user_id"] == USER
