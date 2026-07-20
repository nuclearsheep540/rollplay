# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Session ETL envelope schemas — payloads for game start/end HTTP boundary."""

from typing import Dict, List, Optional

from .assets import AssetRef
from .base import ContractModel
from .audio import AudioChannelState, AudioTrackConfig
from .character import DungeonMaster, PlayerCharacter, SessionUser
from .display import ActiveDisplayType
from .image import ImageConfig
from .map import MapConfig
from .spotify import SpotifyState


class PlayerState(ContractModel):
    user_id: str
    player_name: str
    # None when the player is known to the session but not currently seated —
    # they still round-trip so character state (color) syncs cold for everyone.
    seat_position: Optional[int] = None
    character_id: Optional[str] = None
    # Character-owned color (hex). None when the player's character has no custom
    # color — display falls back to the seat-index palette client-side.
    color: Optional[str] = None


class LogEntry(ContractModel):
    """One adventure-log line, shaped like the api-game Mongo doc (sans room_id).

    timestamp is ISO-8601 with explicit UTC offset — same rule as urls_expire_at.
    log_id is the microsecond ordering key api-game stamps at insert."""

    message: str
    type: str
    timestamp: str
    from_player: Optional[str] = None
    log_id: int
    prompt_id: Optional[str] = None


class SessionStats(ContractModel):
    duration_minutes: int
    total_logs: int
    max_players: int


class SessionStartPayload(ContractModel):
    """Complete payload for POST /game/session/start."""

    session_id: str
    campaign_id: str
    dungeon_master: DungeonMaster
    max_players: int = 8
    joined_user_ids: List[str] = []
    session_users: List[SessionUser] = []
    assets: List[AssetRef] = []
    audio_config: Dict[str, AudioChannelState] = {}
    audio_track_config: Dict[str, AudioTrackConfig] = {}
    spotify_state: SpotifyState = SpotifyState()  # DM's Spotify BGM block — restored on start; contract supplies defaults (e.g. -12 dB level)
    map_config: Optional[MapConfig] = None
    image_config: Optional[ImageConfig] = None
    active_display: Optional[ActiveDisplayType] = None
    adventure_log: List[LogEntry] = []
    # ISO-8601 with explicit UTC offset (never naive — JS parses offset-less strings as
    # local time). Kept a string end-to-end so no hop re-serializes it naively.
    urls_expire_at: Optional[str] = None


class SessionEndFinalState(ContractModel):
    """Structure of final_state returned by POST /game/session/end."""

    players: List[PlayerState] = []
    session_stats: Optional[SessionStats] = None
    audio_state: Dict[str, AudioChannelState] = {}
    audio_track_config: Dict[str, AudioTrackConfig] = {}
    broadcast_master_volume: Optional[float] = None
    spotify_state: SpotifyState = SpotifyState()  # DM's Spotify BGM block — cold-stored for cross-session restore
    map_state: Optional[MapConfig] = None
    image_state: Optional[ImageConfig] = None
    active_display: Optional[ActiveDisplayType] = None
    adventure_log: List[LogEntry] = []


class SessionStartResponse(ContractModel):
    success: bool
    session_id: str
    message: str = ""


class SessionEndResponse(ContractModel):
    success: bool
    final_state: SessionEndFinalState
    message: str = ""
