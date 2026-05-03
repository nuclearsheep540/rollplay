# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Shared boundary schemas between Rollplay services."""

from .audio import AudioChannelState, AudioEffects, AudioTrackConfig
from .assets import AssetRef
from .base import ContractModel
from .character import DungeonMaster, PlayerCharacter, SessionUser
from .cine import ColorFilterOverlay, FilmGrainOverlay, HandHeldMotion, MotionConfig, VisualOverlay
from .display import ActiveDisplayType
from .image import ImageConfig
from .map import FOG_REGIONS_MAX, FogConfig, FogRegion, GridColorMode, GridConfig, MapConfig
from .session import (
    PlayerState,
    SessionEndFinalState,
    SessionEndResponse,
    SessionStartPayload,
    SessionStartResponse,
    SessionStats,
)

__all__ = [
    "ContractModel",
    "AudioChannelState",
    "AudioEffects",
    "AudioTrackConfig",
    "AssetRef",
    "ColorFilterOverlay",
    "DungeonMaster",
    "PlayerCharacter",
    "SessionUser",
    "ActiveDisplayType",
    "FOG_REGIONS_MAX",
    "FogConfig",
    "FogRegion",
    "GridColorMode",
    "GridConfig",
    "ImageConfig",
    "MapConfig",
    "FilmGrainOverlay",
    "VisualOverlay",
    "PlayerState",
    "SessionEndFinalState",
    "SessionEndResponse",
    "SessionStartPayload",
    "SessionStartResponse",
    "SessionStats",
]
