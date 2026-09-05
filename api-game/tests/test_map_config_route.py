# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Tests for PUT /game/{room_id}/map/config — the scoped map_config write.

Two properties matter here and neither was true before this route existed:

  1. A player-token size change reaches the other clients. The DM's slider
     used to save through the whole-map PUT, whose broadcast carries only
     filename, grid_config and map_image_config — so the new size existed in
     MongoDB and on the DM's screen, and nowhere else until a reload.

  2. The write is scoped to the field the caller changed. The whole-map PUT
     replaces the document with the client's cached copy; the fog clobber that
     causes is proven against a real MongoDB in test_services_roundtrip.py.

No MongoDB here: the route's collaborators are faked, so these tests are about
the route's own behaviour — what it validates, what it writes, what it says on
the wire. Every test builds its own fakes and shares nothing.
"""

import pytest

import app as app_module
from shared_contracts.map import PC_TOKEN_SCALE_MAX, PC_TOKEN_SCALE_MIN

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend():
    """api-game runs on asyncio; there is no trio in the image."""
    return "asyncio"


class FakeMapService:
    """Records the scoped write instead of performing it."""

    def __init__(self, succeeds=True):
        self.succeeds = succeeds
        self.calls = []

    async def update_map_config(self, room_id, filename, **fields):
        self.calls.append({"room_id": room_id, "filename": filename, **fields})
        return self.succeeds


class FakeConnectionManager:
    """Records what the route puts on the wire."""

    def __init__(self):
        self.broadcasts = []

    async def update_room_data(self, room_id, data):
        self.broadcasts.append({"room_id": room_id, "data": data})


@pytest.fixture
def route_collaborators(monkeypatch):
    """Swap the route's module-level service and manager for recorders.

    The route resolves both as globals of `app`, so patching them there is
    what the running route actually sees.
    """
    map_service = FakeMapService()
    connection_manager = FakeConnectionManager()
    monkeypatch.setattr(app_module, "map_service", map_service)
    monkeypatch.setattr(app_module, "connection_manager", connection_manager)
    return map_service, connection_manager


class TestBroadcast:
    async def test_scale_change_is_broadcast_to_the_room(self, route_collaborators):
        """The reported bug: other clients never heard about the new size."""
        map_service, connection_manager = route_collaborators

        await app_module.update_map_config_scoped(
            "room-1",
            {"filename": "keep.png", "pc_token_scale": 1.25, "updated_by": "dm"},
        )

        assert len(connection_manager.broadcasts) == 1
        broadcast = connection_manager.broadcasts[0]
        assert broadcast["room_id"] == "room-1"
        assert broadcast["data"]["event_type"] == "map_config_update"
        assert broadcast["data"]["data"]["pc_token_scale"] == 1.25
        assert broadcast["data"]["data"]["filename"] == "keep.png"
        assert broadcast["data"]["data"]["updated_by"] == "dm"

    async def test_broadcast_carries_only_the_keys_the_route_wrote(self, route_collaborators):
        """A key present as null would clear that field on every client.

        The receiving handler merges any key it finds, so the route must not
        announce fields it did not touch — grid_config: None here would wipe
        the grid on every screen in the room.
        """
        _, connection_manager = route_collaborators

        await app_module.update_map_config_scoped(
            "room-1", {"filename": "keep.png", "pc_token_scale": 1.0}
        )

        announced = set(connection_manager.broadcasts[0]["data"]["data"])
        assert announced == {"filename", "pc_token_scale", "updated_by"}

    async def test_nothing_is_broadcast_when_no_map_matched(self, monkeypatch):
        """A 404 must not tell the room a size changed."""
        map_service = FakeMapService(succeeds=False)
        connection_manager = FakeConnectionManager()
        monkeypatch.setattr(app_module, "map_service", map_service)
        monkeypatch.setattr(app_module, "connection_manager", connection_manager)

        with pytest.raises(app_module.HTTPException) as raised:
            await app_module.update_map_config_scoped(
                "room-1", {"filename": "gone.png", "pc_token_scale": 1.0}
            )

        assert raised.value.status_code == 404
        assert connection_manager.broadcasts == []


class TestScopedWrite:
    async def test_only_the_scale_is_written(self, route_collaborators):
        """Nothing else may ride along — that is the whole point of the route."""
        map_service, _ = route_collaborators

        await app_module.update_map_config_scoped(
            "room-1", {"filename": "keep.png", "pc_token_scale": 0.8}
        )

        assert map_service.calls == [
            {"room_id": "room-1", "filename": "keep.png", "pc_token_scale": 0.8}
        ]


class TestValidation:
    @pytest.mark.parametrize("bad_scale", [
        PC_TOKEN_SCALE_MIN - 0.1,
        PC_TOKEN_SCALE_MAX + 0.1,
        "1.0",
        None,
        True,
    ])
    async def test_a_scale_the_contract_would_reject_is_refused(
        self, route_collaborators, bad_scale
    ):
        """Out-of-range values must never reach MongoDB.

        MapConfig bounds pc_token_scale, and session end rebuilds a MapConfig
        from whatever the document holds — so a value written past the bounds
        here would fail the ETL rather than the request that caused it.
        """
        map_service, connection_manager = route_collaborators

        with pytest.raises(app_module.HTTPException) as raised:
            await app_module.update_map_config_scoped(
                "room-1", {"filename": "keep.png", "pc_token_scale": bad_scale}
            )

        assert raised.value.status_code == 400
        assert map_service.calls == []
        assert connection_manager.broadcasts == []

    async def test_the_bounds_are_accepted(self, route_collaborators):
        map_service, _ = route_collaborators

        for scale in (PC_TOKEN_SCALE_MIN, PC_TOKEN_SCALE_MAX):
            await app_module.update_map_config_scoped(
                "room-1", {"filename": "keep.png", "pc_token_scale": scale}
            )

        assert [call["pc_token_scale"] for call in map_service.calls] == [
            PC_TOKEN_SCALE_MIN, PC_TOKEN_SCALE_MAX
        ]

    @pytest.mark.parametrize("bad_filename", ["", None, 7])
    async def test_a_map_must_be_named(self, route_collaborators, bad_filename):
        """filename is how the write finds its document; empty would match a
        missing field and hit an unrelated map."""
        map_service, _ = route_collaborators

        with pytest.raises(app_module.HTTPException) as raised:
            await app_module.update_map_config_scoped(
                "room-1", {"filename": bad_filename, "pc_token_scale": 1.0}
            )

        assert raised.value.status_code == 400
        assert map_service.calls == []
