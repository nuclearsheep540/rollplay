# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Spotify BGM anchor snapshot — the DM-controlled block that syncs the Spotify bed.

Lives in the room document during a session, rides the ETL envelopes at start/end,
and is broadcast to clients as `spotify_state` / the `spotify` block of initial_state.
This contract is the single authority for its defaults — most importantly the mixer
level: a session that has never touched the fader plays the Spotify bed at -12 dB.
"""

from typing import Dict, Literal, Optional

from pydantic import Field

from .base import ContractModel

# -12 dB in linear gain (≈ 0.251) — full-scale Spotify over the S3 bed is too hot.
# Keep in sync with SPOTIFY_DEFAULT_LEVEL in
# rollplay/app/audio_management/hooks/useSpotifyPlayback.js.
SPOTIFY_DEFAULT_CHANNEL_LEVEL = 10 ** (-12 / 20)


class SpotifyState(ContractModel):
    """Anchor snapshot: what's playing, where in the timeline, and the mixer level."""

    track_uri: Optional[str] = None
    track_meta: Dict = {}
    context_uri: Optional[str] = None  # playlist/album driving playback, if any
    playback_state: Literal["stopped", "playing", "paused"] = "stopped"
    started_at: Optional[float] = None      # epoch seconds anchor while playing
    paused_elapsed: Optional[float] = None  # seconds into the track while paused
    is_looping: bool = False
    is_playing: Optional[bool] = None  # restore-path hint; playback_state is the truth
    channel_level: float = Field(default=SPOTIFY_DEFAULT_CHANNEL_LEVEL, ge=0.0, le=1.0)
    updated_by: Optional[str] = None
