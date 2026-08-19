# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Unit tests for the persisted grid on/off flag (tokens v4, decision 51).

`GridConfig.enabled` was read in five places but never written false, so it
had been a compile-time constant needing no storage. The DM-facing toggle is
the first thing that writes it, which makes it state — and state has to
survive a session boundary or the DM re-sets it every session.

DB-free: MapAsset and the two ETL builders are pure.
"""

from datetime import datetime
from uuid import uuid4

from shared_contracts.map import GridConfig

from modules.library.domain.map_asset_aggregate import MapAsset
from modules.library.domain.media_asset_type import MediaAssetType


def make_map_asset(**overrides):
    fields = {
        "id": uuid4(),
        "user_id": uuid4(),
        "filename": "dungeon.png",
        "s3_key": "maps/dungeon.png",
        "content_type": "image/png",
        "asset_type": MediaAssetType.MAP,
        "file_size": 1234,
        "campaign_ids": [],
        "created_at": datetime.utcnow(),
        "updated_at": None,
        # build_grid_config_for_game returns None without dimensions
        "grid_width": 20,
        "grid_height": 20,
    }
    fields.update(overrides)
    return MapAsset(**fields)


class TestGridEnabledColdToHot:
    """MapAsset -> GridConfig (session start)."""

    def test_never_set_reads_as_enabled(self):
        # Every map predating the toggle must keep drawing its grid.
        asset = make_map_asset(grid_enabled=None)
        assert asset.build_grid_config_for_game().enabled is True

    def test_off_survives_to_the_session(self):
        asset = make_map_asset(grid_enabled=False)
        assert asset.build_grid_config_for_game().enabled is False

    def test_on_survives_to_the_session(self):
        asset = make_map_asset(grid_enabled=True)
        assert asset.build_grid_config_for_game().enabled is True

    def test_tuning_is_kept_while_off(self):
        # The whole point of on/off over clear: turning the grid off must not
        # cost the DM their aligned dimensions, offsets or cell size.
        asset = make_map_asset(
            grid_enabled=False, grid_cell_size=64.0, grid_offset_x=12, grid_offset_y=8
        )
        config = asset.build_grid_config_for_game()
        assert config.enabled is False
        assert config.grid_cell_size == 64.0
        assert config.offset_x == 12
        assert config.offset_y == 8


class TestGridEnabledHotToCold:
    """GridConfig -> MapAsset (session end). Without this the flag resets every
    session and the grid silently comes back on."""

    def test_off_is_written_back(self):
        asset = make_map_asset(grid_enabled=True)
        asset.update_grid_config_from_game(
            GridConfig(grid_width=20, grid_height=20, enabled=False, grid_cell_size=64.0)
        )
        assert asset.grid_enabled is False
        assert asset.grid_cell_size == 64.0

    def test_on_is_written_back(self):
        asset = make_map_asset(grid_enabled=False)
        asset.update_grid_config_from_game(
            GridConfig(grid_width=20, grid_height=20, enabled=True)
        )
        assert asset.grid_enabled is True

    def test_round_trip_across_a_session_boundary(self):
        asset = make_map_asset(grid_enabled=None, grid_cell_size=None)
        asset.update_grid_config_from_game(
            GridConfig(grid_width=20, grid_height=20, enabled=False, grid_cell_size=48.0)
        )
        next_session = asset.build_grid_config_for_game()
        assert next_session.enabled is False
        assert next_session.grid_cell_size == 48.0


class TestGridEnabledKeepCurrent:
    """update_grid_config keeps the current value on None, like every field
    beside it — so the workshop's flat PATCH shape, which carries no `enabled`,
    can never switch a grid the DM turned off back on."""

    def test_none_keeps_an_off_grid_off(self):
        asset = make_map_asset(grid_enabled=False)
        asset.update_grid_config(grid_width=30, grid_height=30, grid_cell_size=72.0)
        assert asset.grid_enabled is False
        assert asset.grid_width == 30

    def test_none_keeps_an_unset_map_unset(self):
        asset = make_map_asset(grid_enabled=None)
        asset.update_grid_config(grid_cell_size=72.0)
        assert asset.grid_enabled is None

    def test_explicit_value_still_writes(self):
        asset = make_map_asset(grid_enabled=None)
        asset.update_grid_config(grid_enabled=False)
        assert asset.grid_enabled is False
