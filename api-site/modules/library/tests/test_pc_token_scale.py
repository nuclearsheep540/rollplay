# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Unit tests for the map's player-token scale (tokens v4, decisions 42-49).

Covers the ETL round-trip the feature depends on — the value has to survive a
session boundary, or the DM re-sets it every session — plus the two shape
guarantees that keep it out of the grid subsystem.

DB-free: MapAsset and its two contract translators are pure.
"""

from datetime import datetime
from uuid import uuid4

from shared_contracts.map import GridConfig, MapConfig

from modules.library.domain.map_asset_aggregate import MapAsset
from modules.library.domain.media_asset_type import MediaAssetType


def make_map_asset(**overrides):
    fields = {
        "id": uuid4(),
        "user_id": uuid4(),
        "filename": "clearing.png",
        "s3_key": "maps/clearing.png",
        "content_type": "image/png",
        "asset_type": MediaAssetType.MAP,
        "file_size": 2048,
        "campaign_ids": [],
        "created_at": datetime.utcnow(),
        "updated_at": None,
    }
    fields.update(overrides)
    return MapAsset(**fields)


class TestPcTokenScaleColdToHot:
    """MapAsset -> MapConfig (session start)."""

    def test_never_set_travels_as_none(self):
        # None reads as 1.0 client-side, so a map predating the feature
        # renders exactly as it did.
        asset = make_map_asset(pc_token_scale=None)
        assert asset.to_contract(file_path="https://s3/clearing.png").pc_token_scale is None

    def test_value_travels_to_the_session(self):
        asset = make_map_asset(pc_token_scale=0.75)
        assert asset.to_contract(file_path="https://s3/clearing.png").pc_token_scale == 0.75

    def test_travels_on_a_map_with_no_grid(self):
        # The population the feature exists for: no grid config at all, so
        # build_grid_config_for_game returns None and the scale rides alone.
        asset = make_map_asset(pc_token_scale=0.6)
        contract = asset.to_contract(file_path="https://s3/clearing.png")
        assert contract.grid_config is None
        assert contract.pc_token_scale == 0.6


class TestPcTokenScaleHotToCold:
    """MapConfig -> MapAsset (session end). Without this the DM re-sets the
    scale every session."""

    def test_value_is_written_back(self):
        asset = make_map_asset(pc_token_scale=None)
        asset.update_from_contract(MapConfig(
            asset_id=str(asset.id), filename="clearing.png",
            file_path="https://s3/clearing.png", pc_token_scale=1.25,
        ))
        assert asset.pc_token_scale == 1.25

    def test_none_clears_it(self):
        # Owner path: None means "the DM reset it to default", not "no signal".
        # map_load is the surface that chaperones a MapConfig, and it applies
        # the preserve rule itself before this is ever reached.
        asset = make_map_asset(pc_token_scale=1.25)
        asset.update_from_contract(MapConfig(
            asset_id=str(asset.id), filename="clearing.png",
            file_path="https://s3/clearing.png", pc_token_scale=None,
        ))
        assert asset.pc_token_scale is None

    def test_round_trip_across_a_session_boundary(self):
        asset = make_map_asset(pc_token_scale=None)
        asset.update_from_contract(MapConfig(
            asset_id=str(asset.id), filename="clearing.png",
            file_path="https://s3/clearing.png", pc_token_scale=0.8,
        ))
        assert asset.to_contract(file_path="https://s3/fresh.png").pc_token_scale == 0.8


class TestPcTokenScaleIsNotGridState:
    """Guards the shape decision the reverted v4 design got wrong. If this
    value ever migrates into grid_config, snapping and the exact-cell re-snap
    start reading it and the two subsystems entangle again — see plan §0."""

    def test_it_is_not_a_grid_config_field(self):
        assert "pc_token_scale" in MapConfig.model_fields
        assert "pc_token_scale" not in GridConfig.model_fields

    def test_grid_config_is_untouched_by_the_scale(self):
        asset = make_map_asset(
            grid_width=20, grid_height=20, grid_cell_size=64.0, pc_token_scale=0.5
        )
        grid = asset.build_grid_config_for_game()
        assert grid.grid_cell_size == 64.0
        assert grid.enabled is True
        assert not hasattr(grid, "pc_token_scale")

    def test_update_grid_config_cannot_touch_it(self):
        asset = make_map_asset(pc_token_scale=0.75)
        asset.update_grid_config(grid_width=30, grid_height=30, grid_cell_size=50.0)
        assert asset.pc_token_scale == 0.75
