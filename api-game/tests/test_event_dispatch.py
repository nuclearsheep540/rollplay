# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Tests for the WebSocket dispatch table.

The receive loop used to be 29 hand-written if/elif branches, which meant the
routing rules could only be checked by reading them. As a dict it is data, so
the invariants that matter can be asserted.

The security invariant is the important one: the table is the wire allowlist.
WebsocketEvent also carries methods the server calls itself — player_connection,
player_disconnect, player_displaced, system_message — plus private name and
logging helpers. Building the table with getattr(WebsocketEvent, event_type)
would let any client invoke all of them, so it is written out explicitly and
this file guards that.
"""

import inspect

from websocket_handlers.app_websocket import EVENT_HANDLERS
from websocket_handlers.websocket_events import WebsocketEvent

# Called by the server on its own initiative, never in response to a client
# frame. None of these may ever be reachable from the wire.
SERVER_ONLY_METHODS = [
    "player_connection",
    "player_disconnect",
    "player_displaced",
    "system_message",
]

HANDLER_PARAMETERS = [
    "websocket", "data", "event_data", "user_id", "client_id", "manager",
]


class TestAllowlist:
    def test_server_only_methods_are_not_dispatchable(self):
        dispatchable = set(EVENT_HANDLERS.values())
        for method_name in SERVER_ONLY_METHODS:
            method = getattr(WebsocketEvent, method_name)
            assert method not in dispatchable, (
                f"{method_name} is reachable from the wire; it is server-initiated only"
            )

    def test_no_private_helper_is_dispatchable(self):
        for event_type, handler in EVENT_HANDLERS.items():
            assert not handler.__name__.startswith("_"), (
                f"{event_type} dispatches the private helper {handler.__name__}"
            )

    def test_table_is_not_built_by_reflection(self):
        """A getattr-built table would expose every public async method.

        If this ever fails it means the table has drifted into being derived
        from the class rather than declared, which silently re-opens the
        server-only methods above.
        """
        public_async_methods = {
            name for name, member in inspect.getmembers(WebsocketEvent)
            if inspect.iscoroutinefunction(member) and not name.startswith("_")
        }
        assert public_async_methods - set(EVENT_HANDLERS) == set(SERVER_ONLY_METHODS)


class TestHandlerContract:
    def test_every_handler_is_async(self):
        for event_type, handler in EVENT_HANDLERS.items():
            assert inspect.iscoroutinefunction(handler), (
                f"{event_type} is not a coroutine function; the loop awaits it"
            )

    def test_every_handler_takes_the_dispatch_signature(self):
        """The loop calls every handler with the same six keywords."""
        for event_type, handler in EVENT_HANDLERS.items():
            parameters = list(inspect.signature(handler).parameters)
            assert parameters == HANDLER_PARAMETERS, (
                f"{event_type} takes {parameters}, which the loop cannot call"
            )

    def test_event_type_matches_its_handler_name(self):
        """Not required by the loop, but a mismatch is almost always a typo
        that routes an event to the wrong handler."""
        for event_type, handler in EVENT_HANDLERS.items():
            assert handler.__name__ == event_type

    def test_no_duplicate_handlers(self):
        handler_names = [handler.__name__ for handler in EVENT_HANDLERS.values()]
        assert len(handler_names) == len(set(handler_names))
