# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Unit tests for ConnectionManager's socket identity rule (decision 57).

`connect` stores one socket per user per room, so a second tab — or a
reconnect that raced the previous socket's close — displaces the earlier
entry. The displaced socket is still open and closes later, and that close
must not be read as the user leaving: it used to null the live socket and
schedule the removal of a player sitting right there. Since decision 54
removed idle hold expiry, this teardown is the only remaining way a live hand
can lose its map-token holds mid-drag.
"""

import asyncio

from websocket_handlers.connection_manager import ConnectionManager

ROOM = "room-1"
USER = "alice"


class FakeWebSocket:
    """Stands in for a Starlette WebSocket — identity is all these tests use."""


def make_manager_with_connection():
    """A manager holding exactly one live connection.

    Built by hand rather than through `connect`, which accepts a real socket
    and broadcasts a lobby update off the database.
    """
    manager = ConnectionManager()
    live_socket = FakeWebSocket()
    manager.connections.append(live_socket)
    manager.room_users[ROOM] = {
        USER: {"websocket": live_socket, "is_in_party": False, "status": "connected"}
    }
    return manager, live_socket


def displace_with_new_socket(manager):
    """Second tab: `connect` overwrites the user's slot, leaving the first
    socket open but no longer reachable through room_users."""
    new_socket = FakeWebSocket()
    manager.connections.append(new_socket)
    manager.room_users[ROOM][USER]["websocket"] = new_socket
    return new_socket


class TestIsCurrentConnection:
    def test_stored_socket_is_current(self):
        manager, live_socket = make_manager_with_connection()
        assert manager.is_current_connection(live_socket, ROOM, USER) is True

    def test_displaced_socket_is_not_current(self):
        manager, first_socket = make_manager_with_connection()
        displace_with_new_socket(manager)
        assert manager.is_current_connection(first_socket, ROOM, USER) is False

    def test_unknown_user_is_not_current(self):
        manager, live_socket = make_manager_with_connection()
        assert manager.is_current_connection(live_socket, ROOM, "bob") is False

    def test_unknown_room_is_not_current(self):
        manager, live_socket = make_manager_with_connection()
        assert manager.is_current_connection(live_socket, "room-2", USER) is False


class TestRemoveConnection:
    def test_stale_socket_close_leaves_the_live_session_alone(self):
        manager, first_socket = make_manager_with_connection()
        second_socket = displace_with_new_socket(manager)

        # Run inside a loop even though the correct path needs none: without
        # it, code that wrongly reaches schedule_user_removal dies on the
        # missing event loop and the assertions below never get to speak.
        async def close_stale_socket():
            manager.remove_connection(first_socket, ROOM, USER)

        asyncio.run(close_stale_socket())

        entry = manager.room_users[ROOM][USER]
        assert entry["websocket"] is second_socket
        assert entry["status"] == "connected"
        assert manager.disconnect_timeouts == {}
        # The dead socket itself is still dropped from the broadcast list.
        assert first_socket not in manager.connections
        assert second_socket in manager.connections

    def test_current_socket_close_disconnects_the_user(self):
        manager, live_socket = make_manager_with_connection()

        async def close_socket():
            manager.remove_connection(live_socket, ROOM, USER)
            # schedule_user_removal starts a 30s task; cancel it here so it
            # cannot outlive this test's event loop.
            manager.disconnect_timeouts[ROOM][USER].cancel()

        asyncio.run(close_socket())

        entry = manager.room_users[ROOM][USER]
        assert entry["websocket"] is None
        assert entry["status"] == "disconnecting"
        assert live_socket not in manager.connections
