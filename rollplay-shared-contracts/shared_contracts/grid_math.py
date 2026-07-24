# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Grid lattice math shared by api-game (runtime re-snap on grid change) and
api-site (workshop baseline re-snap on grid save).

Mirrors the client's snapping in app/map_tokens/config.js (snapTokenCenter):
odd footprints anchor on cell centers, even footprints on cell corners
(grid intersections). Coordinates are map-image-native pixels; offsets are
the absolute position of cell (0, 0); grid_cell_size is native px per cell.

Re-snap semantics (tokens v2, decision 20 — supersedes v1 decision 7):
a token keeps its exact cell across a grid geometry change. C4 under the old
grid means C4's anchor under the new grid. An index that fell inside the old
grid but past the new one clamps to the nearest surviving row/column; a token
that never had an old-grid address (grid absent, disabled, or untuned) snaps
to the nearest lattice position under the new grid. Tokens sitting on the
virtual lattice outside the drawn grid keep their virtual index unclamped —
clamping them would yank deliberate margin placements into the grid.
"""

import math
from typing import Any, Dict, Optional, Tuple


def grid_usable(grid_config: Optional[Dict[str, Any]]) -> bool:
    """A grid can address positions: present, enabled, cell size tuned."""
    if not grid_config or not grid_config.get("enabled"):
        return False
    cell_size = grid_config.get("grid_cell_size")
    return bool(cell_size) and cell_size > 0


GEOMETRY_FIELDS = ("enabled", "grid_cell_size", "offset_x", "offset_y", "grid_width", "grid_height")


def grid_geometry_changed(old_grid_config: Optional[Dict[str, Any]],
                          new_grid_config: Optional[Dict[str, Any]]) -> bool:
    """True when a config change moves the lattice (positions need re-snap).
    Cosmetic fields (opacity, line color) never trigger a board rewrite."""
    old_grid_config = old_grid_config or {}
    new_grid_config = new_grid_config or {}
    for field_name in GEOMETRY_FIELDS:
        if old_grid_config.get(field_name) != new_grid_config.get(field_name):
            return True
    return False


def _round_half_up(value: float) -> int:
    """JS Math.round twin — Python's round() is banker's rounding, which
    would diverge from the client at exact half-cell positions."""
    return math.floor(value + 0.5)


def _axis_index(value: float, origin: float, cell_size: float, footprint: int) -> int:
    """Lattice index of a token anchor on one axis: cell index for odd
    footprints (center-anchored), intersection index for even (corner)."""
    if footprint % 2 == 1:
        return math.floor((value - origin) / cell_size)
    return _round_half_up((value - origin) / cell_size)


def _axis_position(index: int, origin: float, cell_size: float, footprint: int) -> float:
    """Anchor coordinate of a lattice index on one axis (inverse of _axis_index)."""
    if footprint % 2 == 1:
        return origin + (index + 0.5) * cell_size
    return origin + index * cell_size


def _axis_upper_index(cell_count: int, footprint: int) -> int:
    """Highest in-bounds index on an axis: last cell for odd footprints,
    last intersection (== cell_count) for even."""
    if footprint % 2 == 1:
        return cell_count - 1
    return cell_count


def _resnap_axis(value: float, footprint: int,
                 old_origin: float, old_cell_size: float, old_cell_count: int,
                 new_origin: float, new_cell_size: float, new_cell_count: int) -> float:
    index = _axis_index(value, old_origin, old_cell_size, footprint)

    old_in_bounds = (
        old_cell_count > 0
        and 0 <= index <= _axis_upper_index(old_cell_count, footprint)
    )
    if old_in_bounds and new_cell_count > 0:
        index = max(0, min(_axis_upper_index(new_cell_count, footprint), index))

    return _axis_position(index, new_origin, new_cell_size, footprint)


def snap_axis_nearest(value: float, origin: float, cell_size: float, footprint: int) -> float:
    """Nearest lattice anchor on one axis (the client snapTokenCenter twin)."""
    if footprint % 2 == 1:
        cell_index = math.floor((value - origin) / cell_size)
        return origin + (cell_index + 0.5) * cell_size
    return origin + _round_half_up((value - origin) / cell_size) * cell_size


def resnap_token_position(x: float, y: float, footprint: int,
                          old_grid_config: Optional[Dict[str, Any]],
                          new_grid_config: Optional[Dict[str, Any]]) -> Tuple[float, float]:
    """Re-project a token anchor across a grid geometry change (decision 20).

    New grid unusable: position untouched. Old grid unusable: nearest-lattice
    fallback under the new grid. Otherwise exact index preservation with the
    clamp rule described in the module docstring.
    """
    if not grid_usable(new_grid_config):
        return x, y

    new_origin_x = new_grid_config.get("offset_x") or 0
    new_origin_y = new_grid_config.get("offset_y") or 0
    new_cell_size = new_grid_config["grid_cell_size"]

    if not grid_usable(old_grid_config):
        return (
            snap_axis_nearest(x, new_origin_x, new_cell_size, footprint),
            snap_axis_nearest(y, new_origin_y, new_cell_size, footprint),
        )

    old_origin_x = old_grid_config.get("offset_x") or 0
    old_origin_y = old_grid_config.get("offset_y") or 0
    old_cell_size = old_grid_config["grid_cell_size"]

    new_x = _resnap_axis(
        x, footprint,
        old_origin_x, old_cell_size, old_grid_config.get("grid_width") or 0,
        new_origin_x, new_cell_size, new_grid_config.get("grid_width") or 0,
    )
    new_y = _resnap_axis(
        y, footprint,
        old_origin_y, old_cell_size, old_grid_config.get("grid_height") or 0,
        new_origin_y, new_cell_size, new_grid_config.get("grid_height") or 0,
    )
    return new_x, new_y
