# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Pure builders for committed MapToken operations.

Kept free of database imports so the op logic (atomic array surgery, grid
cell labelling) unit-tests directly. GameService.apply_map_token_op executes
what these functions build.
"""

import math
from typing import Any, Dict, Optional, Tuple

VALID_MAP_TOKEN_OPS = ("place", "move", "remove", "configure")


def is_valid_asset_key(asset_id: Any) -> bool:
    """Hard-block invariant: asset_id becomes a Mongo field name under
    map_token_state, so a dot (nested-path split), a leading '$' (operator),
    or a NUL byte would silently corrupt the document rather than error.
    Real asset_ids are UUID strings; reject anything that couldn't be one."""
    if not asset_id or not isinstance(asset_id, str):
        return False
    return "." not in asset_id and "\x00" not in asset_id and not asset_id.startswith("$")

# Fields a "configure" op may change. Position changes are "move"; identity
# fields (id, kind, owner_user_id, created_by) are immutable after place.
CONFIGURABLE_TOKEN_FIELDS = ("label", "footprint")


def map_token_array_path(asset_id: str) -> str:
    """Dotted Mongo path of one map's token array on the session doc."""
    return f"map_token_state.{asset_id}"


def build_map_token_update(
    asset_id: str,
    op: str,
    token: Optional[Dict[str, Any]] = None,
    token_id: Optional[str] = None,
    updated_at: str = "",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Build (extra_filter, update_doc) for one committed token op.

    extra_filter merges into the room filter so every op is a single atomic
    update_one — per-op array surgery, never whole-array replace from the
    client. Two players committing different tokens simultaneously can't
    clobber each other; same-token races are last-write-wins.

    Per op:
      place     — $push, filtered on the id NOT already present (atomic
                  per-map id-uniqueness guard; ids are client-minted uuid4)
      move      — positional $set of x/y on the matched array element
      remove    — $pull by id (idempotent: removing an absent id is a no-op)
      configure — positional $set of CONFIGURABLE_TOKEN_FIELDS present in token
    """
    array_path = map_token_array_path(asset_id)

    if op == "place":
        placed_token = {**token, "updated_at": updated_at}
        extra_filter = {f"{array_path}.id": {"$ne": token["id"]}}
        update_doc = {"$push": {array_path: placed_token}}
        return extra_filter, update_doc

    if op == "move":
        extra_filter = {f"{array_path}.id": token_id}
        update_doc = {
            "$set": {
                f"{array_path}.$.x": token["x"],
                f"{array_path}.$.y": token["y"],
                f"{array_path}.$.updated_at": updated_at,
            }
        }
        return extra_filter, update_doc

    if op == "remove":
        return {}, {"$pull": {array_path: {"id": token_id}}}

    if op == "configure":
        set_fields = {f"{array_path}.$.updated_at": updated_at}
        for field_name in CONFIGURABLE_TOKEN_FIELDS:
            if token.get(field_name) is not None:
                set_fields[f"{array_path}.$.{field_name}"] = token[field_name]
        return {f"{array_path}.id": token_id}, {"$set": set_fields}

    raise ValueError(f"Unknown map token op: {op}")


def _col_index_to_label(index: int) -> str:
    """Excel-style column label: 0→A, 25→Z, 26→AA … (mirrors GridOverlay.colIndexToLabel)."""
    label = ""
    remaining = index + 1  # work in 1-based space
    while remaining > 0:
        remaining, remainder = divmod(remaining - 1, 26)
        label = chr(65 + remainder) + label
    return label


def grid_cell_label(point_x: float, point_y: float, grid_config: Optional[Dict[str, Any]]) -> Optional[str]:
    """Cell label ('D7') for a native-image-px point, or None when the grid
    can't address it: grid absent/disabled, cell size untuned (the client-side
    fallback needs image dimensions the server doesn't have), or out of bounds.

    Mirrors GridOverlay.cellAtPoint in native-px space: offsets are the
    absolute position of cell (0,0), grid_cell_size is native px per cell.
    """
    if not grid_config or not grid_config.get("enabled"):
        return None

    cell_size = grid_config.get("grid_cell_size")
    if not cell_size or cell_size <= 0:
        return None

    col = math.floor((point_x - grid_config.get("offset_x", 0)) / cell_size)
    row = math.floor((point_y - grid_config.get("offset_y", 0)) / cell_size)

    grid_width = grid_config.get("grid_width", 0)
    grid_height = grid_config.get("grid_height", 0)
    if col < 0 or col >= grid_width or row < 0 or row >= grid_height:
        return None

    return f"{_col_index_to_label(col)}{row + 1}"
