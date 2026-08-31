# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Connection-transition contract for presence fan-out.

Presence is announced per USER, not per socket: a friend opening a second tab
did not "come online" again, and closing one of two tabs did not take them
offline. `connect`/`disconnect` report those transitions so the WebSocket
endpoint can fan out exactly once at each edge.

Every test builds its own manager and its own fake sockets — the module-level
`event_connection_manager` singleton is never touched here, because a test that
registered a connection on it would leak presence state into every other test in
the run.

DB-free: the manager is an in-process registry.
"""

import asyncio

import pytest

from modules.events.websocket_manager import EventConnectionManager


def run_async(coro):
    """Run an async coroutine synchronously in tests (repo convention)."""
    return asyncio.get_event_loop().run_until_complete(coro)


class FakeWebSocket:
    """Stands in for a FastAPI WebSocket — the manager only ever stores it in a set."""


@pytest.fixture
def manager():
    return EventConnectionManager()


class TestComingOnline:
    def test_first_connection_reports_the_user_came_online(self, manager):
        came_online = run_async(manager.connect(FakeWebSocket(), "user-1"))

        assert came_online is True

    def test_second_tab_does_not_report_coming_online_again(self, manager):
        run_async(manager.connect(FakeWebSocket(), "user-1"))

        came_online = run_async(manager.connect(FakeWebSocket(), "user-1"))

        assert came_online is False

    def test_each_user_transitions_independently(self, manager):
        run_async(manager.connect(FakeWebSocket(), "user-1"))

        came_online = run_async(manager.connect(FakeWebSocket(), "user-2"))

        assert came_online is True


class TestGoingOffline:
    def test_last_connection_closing_reports_the_user_went_offline(self, manager):
        socket = FakeWebSocket()
        run_async(manager.connect(socket, "user-1"))

        went_offline = run_async(manager.disconnect(socket, "user-1"))

        assert went_offline is True

    def test_closing_one_of_two_tabs_keeps_the_user_online(self, manager):
        first_tab = FakeWebSocket()
        second_tab = FakeWebSocket()
        run_async(manager.connect(first_tab, "user-1"))
        run_async(manager.connect(second_tab, "user-1"))

        went_offline = run_async(manager.disconnect(first_tab, "user-1"))

        assert went_offline is False
        assert manager.is_user_connected("user-1") is True

    def test_closing_both_tabs_reports_offline_on_the_second(self, manager):
        first_tab = FakeWebSocket()
        second_tab = FakeWebSocket()
        run_async(manager.connect(first_tab, "user-1"))
        run_async(manager.connect(second_tab, "user-1"))

        run_async(manager.disconnect(first_tab, "user-1"))
        went_offline = run_async(manager.disconnect(second_tab, "user-1"))

        assert went_offline is True
        assert manager.is_user_connected("user-1") is False

    def test_disconnecting_an_unknown_user_reports_no_transition(self, manager):
        went_offline = run_async(manager.disconnect(FakeWebSocket(), "never-connected"))

        assert went_offline is False
