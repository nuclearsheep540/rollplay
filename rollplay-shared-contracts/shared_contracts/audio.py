# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Audio boundary schemas for the ETL between api-site and api-game."""

from typing import Literal, Optional

from pydantic import BaseModel, Field


class AudioEffects(BaseModel):
    """Effect toggle state — V1 stores booleans only, V2 will add parameters."""

    hpf: bool = False
    lpf: bool = False
    reverb: bool = False


class AudioChannelState(BaseModel):
    """Complete state of a single audio channel (BGM or SFX) in MongoDB."""

    # Identity
    filename: Optional[str] = None
    asset_id: Optional[str] = None
    s3_url: Optional[str] = None
    # Playback config (persistent)
    volume: float = Field(default=0.8, ge=0.0, le=1.3)
    looping: bool = True
    effects: AudioEffects = AudioEffects()
    # Channel-level state (persistent, survives track swaps)
    muted: bool = False
    soloed: bool = False
    # Runtime state (not persisted to PostgreSQL)
    playback_state: Literal["playing", "paused", "stopped"] = "stopped"
    started_at: Optional[float] = Field(default=None, ge=0)
    paused_elapsed: Optional[float] = Field(default=None, ge=0)


class AudioTrackConfig(BaseModel):
    """Stashed config for a track swapped out of a channel. Keyed by asset_id."""

    volume: Optional[float] = Field(default=None, ge=0.0, le=1.3)
    looping: Optional[bool] = None
    effects: AudioEffects = AudioEffects()
    paused_elapsed: Optional[float] = Field(default=None, ge=0)
