# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Spotify Web API client — the anti-corruption layer.

This is the only place that knows Spotify's HTTP details: building the consent
URL, exchanging the auth code for tokens, refreshing tokens, and reading the
user's profile. Everything else in the integration deals in plain dicts.

Mirrors the `S3Service(settings)` + `get_*_service()` singleton pattern used in
shared/services/s3_service.py.
"""

import logging
from typing import Optional
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException

from config.settings import Settings

logger = logging.getLogger(__name__)

AUTHORIZE_URL = "https://accounts.spotify.com/authorize"
TOKEN_URL = "https://accounts.spotify.com/api/token"
API_BASE = "https://api.spotify.com/v1"

# Phase 2 (game-runtime BGM): identity + Web Playback SDK + playback control + playlist reads.
#   user-read-email / user-read-private → profile card (display_name, email, country, product)
#   streaming                            → Web Playback SDK playback in the browser (Premium only)
#   user-read/modify-playback-state      → transfer playback to the SDK device, control it
#   playlist-read-private/collaborative  → list the DM's own playlists for the picker
# NOTE: users who linked under Phase 1 (identity-only) must re-connect once to grant these.
SCOPES = (
    "user-read-email user-read-private streaming "
    "user-read-playback-state user-modify-playback-state "
    "playlist-read-private playlist-read-collaborative"
)


class SpotifyClient:
    """Thin async wrapper over Spotify's OAuth + Web API endpoints."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self.client_id = settings.SPOTIFY_CLIENT_ID
        self.client_secret = settings.SPOTIFY_CLIENT_SECRET
        self.redirect_uri = settings.SPOTIFY_REDIRECT_URI

    @property
    def is_configured(self) -> bool:
        return bool(self.client_id and self.client_secret and self.redirect_uri)

    def require_configured(self) -> None:
        """Guard for endpoints — 503 when the server has no Spotify credentials,
        matching the LiveKit/stream module's _require_credentials() pattern."""
        if not self.is_configured:
            raise HTTPException(
                status_code=503,
                detail="Spotify is not configured on the server",
            )

    def build_authorize_url(self, state: str) -> str:
        """Build the consent URL to redirect the user to."""
        params = {
            "client_id": self.client_id,
            "response_type": "code",
            "redirect_uri": self.redirect_uri,
            "scope": SCOPES,
            "state": state,
        }
        return f"{AUTHORIZE_URL}?{urlencode(params)}"

    async def exchange_code(self, code: str) -> dict:
        """Swap an authorization code for access + refresh tokens."""
        data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": self.redirect_uri,
        }
        return await self._token_request(data)

    async def refresh_tokens(self, refresh_token: str) -> dict:
        """Get a fresh access token using a stored refresh token. Spotify may or
        may not return a new refresh_token — callers keep the old one if absent."""
        data = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        }
        return await self._token_request(data)

    async def get_me(self, access_token: str) -> dict:
        """Read the current user's Spotify profile (GET /v1/me)."""
        return await self._api_get(access_token, "/me")

    async def search(self, access_token: str, query: str, types: str = "track", limit: int = 20) -> dict:
        """Search the Spotify catalogue (GET /v1/search). No user scope required."""
        return await self._api_get(
            access_token,
            "/search",
            params={"q": query, "type": types, "limit": limit},
        )

    async def get_my_playlists(self, access_token: str, limit: int = 50, offset: int = 0) -> dict:
        """List the current user's playlists (GET /v1/me/playlists). Needs playlist-read-private."""
        return await self._api_get(
            access_token,
            "/me/playlists",
            params={"limit": limit, "offset": offset},
        )

    async def get_playlist_tracks(self, access_token: str, playlist_id: str, limit: int = 50, offset: int = 0) -> dict:
        """Page through a playlist's tracks (GET /v1/playlists/{id}/tracks)."""
        return await self._api_get(
            access_token,
            f"/playlists/{playlist_id}/tracks",
            params={"limit": limit, "offset": offset},
        )

    async def _api_get(self, access_token: str, path: str, params: Optional[dict] = None) -> dict:
        """GET a Spotify Web API path with a Bearer token."""
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{API_BASE}{path}",
                headers={"Authorization": f"Bearer {access_token}"},
                params=params,
            )
            response.raise_for_status()
            return response.json()

    async def _token_request(self, data: dict) -> dict:
        """POST to the token endpoint with HTTP Basic auth (client_id:secret)."""
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                TOKEN_URL,
                data=data,
                auth=(self.client_id, self.client_secret),
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            response.raise_for_status()
            return response.json()


# Dependency injection helper — singleton, mirrors get_s3_service().
_spotify_client: Optional[SpotifyClient] = None


def get_spotify_client() -> SpotifyClient:
    """Get the Spotify client singleton (created on first use)."""
    global _spotify_client
    if _spotify_client is None:
        _spotify_client = SpotifyClient(Settings())
    return _spotify_client
