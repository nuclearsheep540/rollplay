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
from .map_token import MapToken
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
    "MapToken",
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
