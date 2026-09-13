# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Shared boundary schemas between Rollplay services."""

from .audio import AudioChannelState, AudioEffects, AudioTrackConfig
from .assets import AssetRef
from .base import ContractModel
from .character import DungeonMaster, PlayerCharacter, SessionUser
from .character_config import (
    CharacterConfig,
    CharacterSheet,
    ComponentChange,
    ComponentGroup,
    ConfigEntry,
    Reconciliation,
    diff_configs,
    initial_value_for,
    reconcile_values,
)
from .components import (
    RUNTIME_TYPE_ORDER,
    AttributeConfiguration,
    AttributeValue,
    ComponentConfiguration,
    ComponentValue,
    HitPointsConfiguration,
    HitPointsValue,
    IntHitPointsRules,
    IntHitPointsState,
    IdentityConfiguration,
    IdentityValue,
    ScaleStep,
    WeightedHitPointsRules,
    WeightedHitPointsState,
)
from .cine import ColorFilterOverlay, FilmGrainOverlay, HandHeldMotion, MotionConfig, VisualOverlay
from .display import ActiveDisplayType
from .grid_math import grid_geometry_changed, grid_usable, resnap_token_position, snap_axis_nearest
from .image import FocalArea, FocalRegion, FocalShape, ImageConfig, focal_center
from .map import FOG_REGIONS_MAX, FogConfig, FogRegion, GridColorMode, GridConfig, MapConfig
from .map_token import MapToken, TokenImageRef
from .session import (
    PlayerState,
    SessionEndFinalState,
    SessionEndResponse,
    SessionStartPayload,
    SessionStartResponse,
    SessionStats,
)
from .spotify import SPOTIFY_DEFAULT_CHANNEL_LEVEL, SpotifyState

__all__ = [
    "ContractModel",
    "AttributeConfiguration",
    "AttributeValue",
    "AudioChannelState",
    "AudioEffects",
    "AudioTrackConfig",
    "AssetRef",
    "ColorFilterOverlay",
    "CharacterConfig",
    "CharacterSheet",
    "ComponentChange",
    "ComponentGroup",
    "ConfigEntry",
    "Reconciliation",
    "initial_value_for",
    "reconcile_values",
    "ComponentConfiguration",
    "ComponentValue",
    "diff_configs",
    "DungeonMaster",
    "HitPointsConfiguration",
    "HitPointsValue",
    "IntHitPointsRules",
    "IntHitPointsState",
    "IdentityConfiguration",
    "IdentityValue",
    "PlayerCharacter",
    "RUNTIME_TYPE_ORDER",
    "ScaleStep",
    "SessionUser",
    "WeightedHitPointsRules",
    "WeightedHitPointsState",
    "ActiveDisplayType",
    "FOG_REGIONS_MAX",
    "FogConfig",
    "FogRegion",
    "GridColorMode",
    "GridConfig",
    "grid_geometry_changed",
    "grid_usable",
    "resnap_token_position",
    "snap_axis_nearest",
    "ImageConfig",
    "MapConfig",
    "MapToken",
    "TokenImageRef",
    "FocalArea",
    "FocalRegion",
    "FocalShape",
    "focal_center",
    "FilmGrainOverlay",
    "VisualOverlay",
    "PlayerState",
    "SessionEndFinalState",
    "SessionEndResponse",
    "SessionStartPayload",
    "SessionStartResponse",
    "SessionStats",
    "SPOTIFY_DEFAULT_CHANNEL_LEVEL",
    "SpotifyState",
]
