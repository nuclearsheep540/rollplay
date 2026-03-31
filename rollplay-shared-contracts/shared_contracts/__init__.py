# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Shared boundary schemas between Rollplay services."""

from .audio import AudioChannelState, AudioEffects, AudioTrackConfig
from .assets import AssetRef
from .base import ContractModel
from .character import DungeonMaster, PlayerCharacter, SessionUser
from .cine import CineConfig, VisualOverlay
from .display import ActiveDisplayType
from .image import ImageConfig
from .map import GridColorMode, GridConfig, MapConfig
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
    "CineConfig",
    "DungeonMaster",
    "PlayerCharacter",
    "SessionUser",
    "ActiveDisplayType",
    "GridColorMode",
    "GridConfig",
    "ImageConfig",
    "MapConfig",
    "VisualOverlay",
    "PlayerState",
    "SessionEndFinalState",
    "SessionEndResponse",
    "SessionStartPayload",
    "SessionStartResponse",
    "SessionStats",
]
