# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Response DTOs for the Spotify integration."""

from typing import List, Optional

from pydantic import BaseModel


class SpotifyProfile(BaseModel):
    """A mapped subset of Spotify's GET /v1/me response, for the profile card."""
    spotify_user_id: Optional[str] = None
    display_name: Optional[str] = None
    email: Optional[str] = None
    country: Optional[str] = None
    product: Optional[str] = None  # "premium" | "free"
    followers: Optional[int] = None
    image_url: Optional[str] = None
    spotify_url: Optional[str] = None


class SpotifyProfileResponse(BaseModel):
    """What the account page fetches: connected flag + (live) profile if linked.

    upstream_status/upstream_error carry the raw Spotify failure through when
    connected is False because Spotify rejected us (allowlist 403, dead refresh
    token, quota 429, …) rather than because no account is linked. The frontend
    diagnostics classify on them — without these, every distinct failure is
    indistinguishable from "never linked" (2026-08-20 audit).
    """
    connected: bool
    profile: Optional[SpotifyProfile] = None
    upstream_status: Optional[int] = None
    upstream_error: Optional[str] = None


# --- Phase 2: game-runtime BGM ---

class SpotifyTokenResponse(BaseModel):
    """Short-lived access token handed to the Web Playback SDK's getOAuthToken callback."""
    access_token: str
    expires_in: int  # seconds until this token expires


class SpotifyTrack(BaseModel):
    uri: str
    name: str
    artist: Optional[str] = None
    album: Optional[str] = None
    art_url: Optional[str] = None
    duration_ms: Optional[int] = None
    is_playable: bool = True  # false when region-blocked/unlicensed (playlist tracks only)


class SpotifySearchResponse(BaseModel):
    tracks: List[SpotifyTrack] = []


class SpotifyPlaylist(BaseModel):
    id: str
    uri: str
    name: str
    image_url: Optional[str] = None
    track_count: Optional[int] = None


class SpotifyPlaylistsResponse(BaseModel):
    playlists: List[SpotifyPlaylist] = []


class SpotifyPlaylistTracksResponse(BaseModel):
    """A page of a playlist's tracks, with total for lazy-load paging."""
    tracks: List[SpotifyTrack] = []
    total: int = 0
    offset: int = 0
    limit: int = 50
