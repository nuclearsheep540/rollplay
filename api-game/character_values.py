# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Component-value operations on a room: pairing, visibility, and log rendering.

api-game never interprets a component. It pairs a value with the player's own config
through shared_contracts.CharacterSheet, strips secret values per viewer, and writes by
path. What a character is made of is the campaign's decision; this module only enforces
that a value matches the configuration it claims.
"""

import logging
from typing import Dict, Optional, Set

from pydantic import TypeAdapter, ValidationError
from shared_contracts.character_config import CharacterConfig, CharacterSheet
from shared_contracts.components import ComponentValue

logger = logging.getLogger(__name__)

LOG_TAG = "CHARACTER_VALUES"

# Building a TypeAdapter compiles a validator, so it is built once at import.
COMPONENT_VALUE_ADAPTER = TypeAdapter(ComponentValue)


def config_for_player(room: dict, user_id: str) -> Optional[CharacterConfig]:
    """The CharacterConfig this player was built against.

    None when they hold no character, are unknown to the room, or the room somehow has no
    entry for their version — all of which mean "cannot validate", not "anything goes".
    """
    metadata = (room.get("player_metadata") or {}).get(user_id)
    if not metadata:
        return None
    version_id = metadata.get("config_version_id")
    if not version_id:
        return None
    raw_config = (room.get("character_configs") or {}).get(version_id)
    if raw_config is None:
        return None
    try:
        return CharacterConfig.model_validate(raw_config)
    except ValidationError as invalid:
        logger.error(f"{LOG_TAG} room holds an unreadable config {version_id}: {invalid}")
        return None


def validate_value_for_player(room: dict, user_id: str, value: ComponentValue) -> None:
    """Check one value against the player's own config.

    Raises:
        ValueError: the player has no config in this room, or the value does not pair with
            it — a wrong type, a wrong representation, an unknown component id. A value
            that is merely outside the configuration's range is accepted: that is a version
            difference the GM is shown, never a block.
    """
    config = config_for_player(room, user_id)
    if config is None:
        raise ValueError("That player has no character config in this game")
    try:
        CharacterSheet(config=config, values={value.component_id: value})
    except ValidationError as mismatch:
        raise ValueError(mismatch.errors()[0]["msg"].replace("Value error, ", "")) from mismatch


def secret_component_ids(config: CharacterConfig) -> Set[str]:
    """Components the GM marked "only the player and GM can see these values"."""
    return {component.id for component in config.components if component.secret}


def _secret_ids_for_player(room: dict, user_id: str) -> Set[str]:
    config = config_for_player(room, user_id)
    return secret_component_ids(config) if config else set()


def _is_game_master(room: dict, viewer_user_id: Optional[str]) -> bool:
    return bool(viewer_user_id) and (room.get("dungeon_master") or {}).get("user_id") == viewer_user_id


def filter_values_for_viewer(room: dict, viewer_user_id: Optional[str]) -> dict:
    """A copy of ``player_metadata`` with secret values removed for everyone but their owner.

    The GM sees everything — they configured it. An unknown viewer (None) sees no secret
    values at all, which is the safe direction to fail. Never mutates the room: this runs
    once per socket, and a mutation would leak one viewer's filtering into the next.
    """
    player_metadata = room.get("player_metadata") or {}
    if _is_game_master(room, viewer_user_id):
        return player_metadata

    filtered = {}
    for user_id, metadata in player_metadata.items():
        if user_id == viewer_user_id or not metadata.get("values"):
            filtered[user_id] = metadata
            continue
        secret_ids = _secret_ids_for_player(room, user_id)
        if not secret_ids:
            filtered[user_id] = metadata
            continue
        visible = {
            component_id: value
            for component_id, value in metadata["values"].items()
            if component_id not in secret_ids
        }
        filtered[user_id] = {**metadata, "values": visible}
    return filtered


def filter_component_change_for_viewer(room: dict, owner_user_id: str, component_id: str,
                                       viewer_user_id: Optional[str]) -> bool:
    """True when this viewer may be told about this one value changing."""
    if viewer_user_id == owner_user_id:
        return True
    if _is_game_master(room, viewer_user_id):
        return True
    return component_id not in _secret_ids_for_player(room, owner_user_id)


def render_value_for_log(configuration, value) -> str:
    """A component value as one short string for the adventure log.

    Generic by construction: the text of a name, the score of an attribute, the current
    number or the scale step's label for hit points. A dict lookup on the config, never an
    interpretation of what the number means. The frontend's describeChange must produce
    exactly this text.
    """
    if configuration.type == "name":
        return value.text
    if configuration.type == "attribute":
        return str(value.score)
    if configuration.type == "hit_points":
        if value.state.representation == "int":
            return str(value.state.current)
        for step in configuration.rules.scale:
            if step.weight == value.state.current_weight:
                return step.label
        # Off-scale: the GM edited the scale under a character that had picked a step.
        # Show the raw weight rather than inventing a label for it.
        return str(value.state.current_weight)
    return str(value)
