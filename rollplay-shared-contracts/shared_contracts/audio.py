# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Audio boundary schemas for the ETL between api-site and api-game."""

from typing import Literal, Optional

from pydantic import Field

from .base import ContractModel


class AudioEffects(ContractModel):
    """Per-channel insert effect state — enabled flags + wet/dry mix levels."""

    eq: bool = False
    hpf: bool = False
    hpf_mix: float = Field(default=0.5, ge=0.0, le=1.0)
    lpf: bool = False
    lpf_mix: float = Field(default=0.5, ge=0.0, le=1.0)
    reverb: bool = False
    reverb_mix: float = Field(default=0.5, ge=0.0, le=1.3)
    reverb_preset: str = "room"


class AudioChannelState(ContractModel):
    """Complete state of a single audio channel (BGM or SFX) in MongoDB."""

    # Identity
    filename: Optional[str] = None
    asset_id: Optional[str] = None
    s3_url: Optional[str] = None
    file_size: Optional[int] = None
    # Playback config (persistent)
    volume: float = Field(default=0.8, ge=0.0, le=1.3)
    looping: bool = True
    effects: AudioEffects = AudioEffects()
    # Channel-level state (persistent, survives track swaps)
    muted: bool = False
    soloed: bool = False
    # Loop point configuration
    loop_mode: Optional[str] = None        # "off" | "full" | "region" | None (legacy)
    loop_start: Optional[float] = Field(default=None, ge=0)
    loop_end: Optional[float] = Field(default=None, ge=0)
    # Runtime state (not persisted to PostgreSQL)
    playback_state: Literal["playing", "paused", "stopped"] = "stopped"
    started_at: Optional[float] = Field(default=None, ge=0)
    paused_elapsed: Optional[float] = Field(default=None, ge=0)


class AudioTrackConfig(ContractModel):
    """Stashed config for a track swapped out of a channel. Keyed by asset_id."""

    volume: Optional[float] = Field(default=None, ge=0.0, le=1.3)
    looping: Optional[bool] = None
    effects: AudioEffects = AudioEffects()
    loop_mode: Optional[str] = None
    loop_start: Optional[float] = Field(default=None, ge=0)
    loop_end: Optional[float] = Field(default=None, ge=0)
    paused_elapsed: Optional[float] = Field(default=None, ge=0)
