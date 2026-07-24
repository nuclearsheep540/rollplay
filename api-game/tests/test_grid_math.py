# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Unit tests for shared_contracts.grid_math — the exact-cell re-snap
(tokens v2 decision 20, superseding v1 decision 7's no-auto-resnap).

Run from api-game/: python -m pytest tests/
Pure math, no database or framework imports.
"""

from shared_contracts.grid_math import (
    grid_geometry_changed,
    grid_usable,
    resnap_token_position,
    snap_axis_nearest,
)


def make_grid(**overrides):
    grid_config = {
        "enabled": True,
        "grid_width": 20,
        "grid_height": 10,
        "offset_x": 0,
        "offset_y": 0,
        "grid_cell_size": 100.0,
    }
    grid_config.update(overrides)
    return grid_config


class TestGridUsable:
    def test_tuned_enabled_grid_is_usable(self):
        assert grid_usable(make_grid()) is True

    def test_absent_disabled_or_untuned_is_not(self):
        assert grid_usable(None) is False
        assert grid_usable(make_grid(enabled=False)) is False
        assert grid_usable(make_grid(grid_cell_size=None)) is False
        assert grid_usable(make_grid(grid_cell_size=0)) is False


class TestGeometryChanged:
    def test_cosmetic_change_is_not_geometry(self):
        old_grid = make_grid()
        new_grid = make_grid()
        new_grid["opacity"] = 0.4
        new_grid["line_color"] = "#ff0000"
        assert grid_geometry_changed(old_grid, new_grid) is False

    def test_each_geometry_field_triggers(self):
        for field_name, changed_value in [
            ("enabled", False),
            ("grid_cell_size", 80.0),
            ("offset_x", 25),
            ("offset_y", 25),
            ("grid_width", 30),
            ("grid_height", 5),
        ]:
            assert grid_geometry_changed(make_grid(), make_grid(**{field_name: changed_value})) is True

    def test_none_vs_grid_triggers(self):
        assert grid_geometry_changed(None, make_grid()) is True


class TestExactCellResnap:
    def test_cell_size_change_keeps_the_cell(self):
        # Token centered in cell (3, 6) at 100px cells → same cell at 80px cells.
        old_grid = make_grid()
        new_grid = make_grid(grid_cell_size=80.0)
        new_x, new_y = resnap_token_position(350.0, 650.0, 1, old_grid, new_grid)
        assert (new_x, new_y) == (3 * 80.0 + 40.0, 6 * 80.0 + 40.0)

    def test_offset_change_moves_with_the_lattice(self):
        # Cell (0, 0) center stays the cell (0, 0) center under the shifted origin.
        old_grid = make_grid()
        new_grid = make_grid(offset_x=30, offset_y=50)
        assert resnap_token_position(50.0, 50.0, 1, old_grid, new_grid) == (80.0, 100.0)

    def test_even_footprint_keeps_its_intersection(self):
        # footprint 2 anchors on corners: intersection (2, 3) at 100px → 80px.
        old_grid = make_grid()
        new_grid = make_grid(grid_cell_size=80.0)
        assert resnap_token_position(200.0, 300.0, 2, old_grid, new_grid) == (160.0, 240.0)

    def test_removed_columns_clamp_to_last_surviving_cell(self):
        # Token in cell (18, 2); new grid is only 10 wide → clamps to cell 9.
        old_grid = make_grid()
        new_grid = make_grid(grid_width=10)
        new_x, new_y = resnap_token_position(1850.0, 250.0, 1, old_grid, new_grid)
        assert (new_x, new_y) == (950.0, 250.0)

    def test_virtual_lattice_outside_grid_is_not_clamped(self):
        # Token deliberately in the margin past the drawn grid (cell index 25
        # of a 20-wide grid) keeps its virtual index rather than being yanked in.
        old_grid = make_grid()
        new_grid = make_grid(grid_cell_size=50.0)
        new_x, new_y = resnap_token_position(2550.0, 250.0, 1, old_grid, new_grid)
        assert (new_x, new_y) == (25 * 50.0 + 25.0, 2 * 50.0 + 25.0)

    def test_unaddressable_old_grid_snaps_nearest_under_new(self):
        # Gridless map gaining a grid: nearest cell center wins.
        new_grid = make_grid()
        assert resnap_token_position(340.0, 620.0, 1, None, new_grid) == (350.0, 650.0)
        assert resnap_token_position(340.0, 620.0, 1, make_grid(enabled=False), new_grid) == (350.0, 650.0)

    def test_unusable_new_grid_leaves_position_alone(self):
        assert resnap_token_position(123.4, 567.8, 1, make_grid(), None) == (123.4, 567.8)
        assert resnap_token_position(123.4, 567.8, 1, make_grid(), make_grid(enabled=False)) == (123.4, 567.8)

    def test_roundtrip_identity_when_geometry_unchanged(self):
        grid_config = make_grid()
        assert resnap_token_position(350.0, 650.0, 1, grid_config, grid_config) == (350.0, 650.0)
        assert resnap_token_position(200.0, 300.0, 2, grid_config, grid_config) == (200.0, 300.0)


class TestNearestSnapMirrorsClient:
    """snap_axis_nearest must match snapTokenCenter's snapAxis in config.js."""

    def test_odd_footprint_snaps_to_cell_center(self):
        assert snap_axis_nearest(340.0, 0, 100.0, 1) == 350.0
        assert snap_axis_nearest(399.9, 0, 100.0, 1) == 350.0

    def test_even_footprint_snaps_to_nearest_corner(self):
        assert snap_axis_nearest(340.0, 0, 100.0, 2) == 300.0
        assert snap_axis_nearest(360.0, 0, 100.0, 2) == 400.0

    def test_offset_origin_respected(self):
        assert snap_axis_nearest(90.0, 50, 100.0, 1) == 100.0

    def test_exact_half_rounds_up_like_js(self):
        # Math.round(2.5) === 3 in JS; Python's round(2.5) is 2 (banker's).
        # The shared math must match the client.
        assert snap_axis_nearest(250.0, 0, 100.0, 2) == 300.0
