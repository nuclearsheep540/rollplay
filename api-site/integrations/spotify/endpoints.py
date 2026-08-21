# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Spotify OAuth + profile endpoints (mounted at /api/spotify).

Phase 1 "just link accounts": connect an account, store tokens, and show the
user's live Spotify profile on the account page. No playback yet.

Auth: every route is gated by the existing cookie-JWT dependency
(get_current_user_id). The OAuth callback works because Spotify's redirect back
is a top-level navigation, so the SameSite=Lax auth_token cookie rides along.
"""

import hmac
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse

from config.settings import Settings
from shared.dependencies.auth import get_current_user_id
from integrations.spotify.client import SpotifyClient, get_spotify_client
from integrations.spotify.dependencies import spotify_account_repository
from integrations.spotify.models import SpotifyAccount
from integrations.spotify.repository import SpotifyAccountRepository
from integrations.spotify.schemas import (
    SpotifyPlaylist,
    SpotifyPlaylistsResponse,
    SpotifyPlaylistTracksResponse,
    SpotifyProfile,
    SpotifyProfileResponse,
    SpotifySearchResponse,
    SpotifyTokenResponse,
    SpotifyTrack,
)

logger = logging.getLogger(__name__)

router = APIRouter()

STATE_COOKIE = "spotify_oauth_state"
FRONTEND_ACCOUNT = "/account"


def _cookie_secure() -> bool:
    """Secure cookies in production (https); off in dev so http://127.0.0.1 works."""
    return Settings().is_production


def _map_profile(me: dict) -> SpotifyProfile:
    """Map Spotify's GET /v1/me payload to our profile DTO."""
    images = me.get("images") or []
    followers = me.get("followers") or {}
    external = me.get("external_urls") or {}
    return SpotifyProfile(
        spotify_user_id=me.get("id"),
        display_name=me.get("display_name"),
        email=me.get("email"),
        country=me.get("country"),
        product=me.get("product"),
        followers=followers.get("total"),
        image_url=images[0]["url"] if images else None,
        spotify_url=external.get("spotify"),
    )


async def _ensure_access_token(
    account: SpotifyAccount,
    repo: SpotifyAccountRepository,
    client: SpotifyClient,
) -> str:
    """Return a non-expired access token, refreshing + persisting if needed.

    This is the primitive every future Spotify call (incl. api-game playback)
    will go through — the reason we bother storing the refresh token.
    """
    if account.is_expired():
        token_data = await client.refresh_tokens(account.refresh_token)
        repo.update_tokens(
            account,
            access_token=token_data["access_token"],
            # Spotify only sometimes returns a fresh refresh_token; keep the old one otherwise.
            refresh_token=token_data.get("refresh_token") or account.refresh_token,
            expires_in=token_data["expires_in"],
            scope=token_data.get("scope"),
        )
    return account.access_token


@router.get("/authorize")
async def authorize(user_id: UUID = Depends(get_current_user_id)):
    """Kick off the OAuth flow: set a CSRF state cookie and redirect to consent."""
    client = get_spotify_client()
    client.require_configured()

    state = secrets.token_urlsafe(32)
    response = RedirectResponse(client.build_authorize_url(state), status_code=302)
    response.set_cookie(
        key=STATE_COOKIE,
        value=state,
        max_age=600,
        httponly=True,
        samesite="lax",
        secure=_cookie_secure(),
        path="/",
    )
    return response


@router.get("/callback")
async def callback(
    request: Request,
    code: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
    user_id: UUID = Depends(get_current_user_id),
    repo: SpotifyAccountRepository = Depends(spotify_account_repository),
):
    """Handle Spotify's redirect: verify state, exchange the code, store tokens."""
    cookie_state = request.cookies.get(STATE_COOKIE)

    def _finish(result: str) -> RedirectResponse:
        resp = RedirectResponse(f"{FRONTEND_ACCOUNT}?spotify={result}", status_code=302)
        resp.delete_cookie(STATE_COOKIE, path="/")
        return resp

    # User denied consent, or Spotify returned no code.
    if error or not code:
        logger.info("Spotify callback aborted (error=%s, code_present=%s)", error, bool(code))
        return _finish("error")

    # CSRF: the state we sent must match the one in the cookie.
    if not state or not cookie_state or not hmac.compare_digest(state, cookie_state):
        logger.warning("Spotify callback state mismatch for user %s", user_id)
        return _finish("error")

    client = get_spotify_client()
    client.require_configured()

    try:
        token_data = await client.exchange_code(code)
        access_token = token_data["access_token"]
        refresh_token = token_data["refresh_token"]
        expires_in = token_data["expires_in"]
        scope = token_data.get("scope", "")
        me = await client.get_me(access_token)
    except (httpx.HTTPStatusError, KeyError) as e:
        logger.warning("Spotify code exchange failed for user %s: %s", user_id, e)
        return _finish("error")

    repo.upsert(
        user_id=user_id,
        spotify_user_id=me.get("id"),
        display_name=me.get("display_name"),
        access_token=access_token,
        refresh_token=refresh_token,
        scope=scope,
        expires_at=datetime.now(timezone.utc) + timedelta(seconds=expires_in),
    )
    logger.info("Spotify connected for user %s (spotify_user_id=%s)", user_id, me.get("id"))
    return _finish("connected")


@router.get("/profile", response_model=SpotifyProfileResponse)
async def profile(
    user_id: UUID = Depends(get_current_user_id),
    repo: SpotifyAccountRepository = Depends(spotify_account_repository),
):
    """The account page's single call: connected? + a LIVE profile from Spotify."""
    account = repo.get_by_user_id(user_id)
    if account is None:
        return SpotifyProfileResponse(connected=False)

    client = get_spotify_client()
    client.require_configured()

    try:
        access_token = await _ensure_access_token(account, repo, client)
        me = await client.get_me(access_token)
    except httpx.HTTPStatusError as e:
        # Several DIFFERENT upstream failures land here — allowlist 403 ("User
        # not registered in the Developer Dashboard"), refresh invalid_grant
        # (revoked / >6-month-old token), quota 429, geo/entitlement 403s — and
        # each needs a different fix. The exception repr omits the response
        # body, which is the only discriminator, so log it and pass it through.
        # Still connected:False (the UI keeps offering reconnect), but the
        # evidence is no longer destroyed at the first hop.
        upstream_status = e.response.status_code if e.response is not None else None
        upstream_error = (e.response.text or "")[:300] if e.response is not None else str(e)
        logger.warning(
            "Spotify profile fetch failed for user %s (upstream %s: %s)",
            user_id, upstream_status, upstream_error,
        )
        return SpotifyProfileResponse(
            connected=False,
            upstream_status=upstream_status,
            upstream_error=upstream_error,
        )
    except httpx.RequestError as e:
        # Spotify unreachable (timeout/DNS/connection reset) — a transient
        # network problem, not an account problem. No upstream_status (there was
        # no response); the error text lets the client classify this as
        # network_error instead of misreading it as "never linked" or a 500.
        logger.warning("Spotify profile fetch network failure for user %s: %s", user_id, e)
        return SpotifyProfileResponse(
            connected=False,
            upstream_error=f"network: {str(e)[:250]}",
        )

    return SpotifyProfileResponse(connected=True, profile=_map_profile(me))


@router.delete("/disconnect", response_model=SpotifyProfileResponse)
async def disconnect(
    user_id: UUID = Depends(get_current_user_id),
    repo: SpotifyAccountRepository = Depends(spotify_account_repository),
):
    """Unlink the user's Spotify account."""
    repo.delete(user_id)
    return SpotifyProfileResponse(connected=False)


# --- Phase 2: game-runtime BGM ---


async def _connected_token(
    user_id: UUID,
    repo: SpotifyAccountRepository,
) -> str:
    """Resolve a valid access token for a connected user, or 404 if not connected."""
    account = repo.get_by_user_id(user_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Spotify not connected")
    client = get_spotify_client()
    client.require_configured()
    return await _ensure_access_token(account, repo, client)


@router.get("/token", response_model=SpotifyTokenResponse)
async def token(
    user_id: UUID = Depends(get_current_user_id),
    repo: SpotifyAccountRepository = Depends(spotify_account_repository),
):
    """Mint a short-lived access token for the Web Playback SDK's getOAuthToken callback."""
    account = repo.get_by_user_id(user_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Spotify not connected")
    client = get_spotify_client()
    client.require_configured()

    try:
        access_token = await _ensure_access_token(account, repo, client)
    except httpx.HTTPStatusError as e:
        # A failure here starves the SDK's getOAuthToken callback on the client.
        # invalid_grant means the refresh token is DEAD (revoked or past the
        # 6-month lifetime) and only a fresh OAuth link fixes it — the body is
        # the discriminator, so log it and put it in the detail the client logs.
        upstream_status = e.response.status_code if e.response is not None else None
        upstream_error = (e.response.text or "")[:300] if e.response is not None else str(e)
        logger.warning(
            "Spotify token refresh failed for user %s (upstream %s: %s)",
            user_id, upstream_status, upstream_error,
        )
        raise HTTPException(
            status_code=502,
            detail=f"Could not obtain a Spotify token (upstream {upstream_status}: {upstream_error})",
        )
    except httpx.RequestError as e:
        # Network failure reaching Spotify — surface it as a structured 502 so
        # the SDK's getOAuthToken failure log carries the actual reason instead
        # of an unhandled 500.
        logger.warning("Spotify token refresh network failure for user %s: %s", user_id, e)
        raise HTTPException(
            status_code=502,
            detail=f"Could not reach Spotify (network): {str(e)[:250]}",
        )

    now = datetime.now(timezone.utc)
    expires_at = account.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    expires_in = max(0, int((expires_at - now).total_seconds()))
    return SpotifyTokenResponse(access_token=access_token, expires_in=expires_in)


@router.get("/search", response_model=SpotifySearchResponse)
async def search(
    q: str = Query(..., min_length=1),
    limit: int = Query(default=20, ge=1, le=50),
    user_id: UUID = Depends(get_current_user_id),
    repo: SpotifyAccountRepository = Depends(spotify_account_repository),
):
    """Search the Spotify track catalogue for the DM's picker."""
    access_token = await _connected_token(user_id, repo)
    client = get_spotify_client()
    try:
        data = await client.search(access_token, query=q, types="track", limit=limit)
    except httpx.HTTPStatusError as e:
        logger.warning("Spotify search failed for user %s: %s", user_id, e)
        raise HTTPException(status_code=502, detail="Spotify search failed")

    items = (data.get("tracks") or {}).get("items") or []
    tracks = [_map_track(item) for item in items if item]
    return SpotifySearchResponse(tracks=tracks)


@router.get("/playlists", response_model=SpotifyPlaylistsResponse)
async def playlists(
    limit: int = Query(default=50, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    user_id: UUID = Depends(get_current_user_id),
    repo: SpotifyAccountRepository = Depends(spotify_account_repository),
):
    """List the DM's own playlists for the picker."""
    access_token = await _connected_token(user_id, repo)
    client = get_spotify_client()
    try:
        data = await client.get_my_playlists(access_token, limit=limit, offset=offset)
    except httpx.HTTPStatusError as e:
        # 403 = the stored token lacks playlist-read scope (linked pre-Phase-2). Nudge a reconnect.
        if e.response is not None and e.response.status_code == 403:
            raise HTTPException(
                status_code=403,
                detail="Spotify playlist access not granted — reconnect Spotify to enable it",
            )
        logger.warning("Spotify playlists fetch failed for user %s: %s", user_id, e)
        raise HTTPException(status_code=502, detail="Could not load Spotify playlists")

    items = data.get("items") or []
    return SpotifyPlaylistsResponse(playlists=[_map_playlist(p) for p in items if p])


@router.get("/playlists/{playlist_id}", response_model=SpotifyPlaylist)
async def playlist_meta(
    playlist_id: str,
    user_id: UUID = Depends(get_current_user_id),
    repo: SpotifyAccountRepository = Depends(spotify_account_repository),
):
    """A single playlist's metadata — used to resolve a playing context_uri to a name on reload."""
    access_token = await _connected_token(user_id, repo)
    client = get_spotify_client()
    try:
        data = await client.get_playlist(access_token, playlist_id)
    except httpx.HTTPStatusError as e:
        logger.warning("Spotify playlist meta fetch failed for user %s: %s", user_id, e)
        raise HTTPException(status_code=502, detail="Could not load playlist")
    return _map_playlist(data)


@router.get("/playlists/{playlist_id}/tracks", response_model=SpotifyPlaylistTracksResponse)
async def playlist_tracks(
    playlist_id: str,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user_id: UUID = Depends(get_current_user_id),
    repo: SpotifyAccountRepository = Depends(spotify_account_repository),
):
    """A page of a playlist's tracks (for the drill-in track picker, lazy-loaded)."""
    access_token = await _connected_token(user_id, repo)
    client = get_spotify_client()
    try:
        data = await client.get_playlist_tracks(access_token, playlist_id, limit=limit, offset=offset)
    except httpx.HTTPStatusError as e:
        logger.warning("Spotify playlist tracks fetch failed for user %s: %s", user_id, e)
        raise HTTPException(status_code=502, detail="Could not load playlist tracks")

    # Playlist items wrap the track; skip removed/local items and non-track entries (e.g. episodes).
    tracks = []
    for item in (data.get("items") or []):
        t = (item or {}).get("track")
        if t and t.get("type") == "track" and t.get("uri"):
            tracks.append(_map_track(t))
    return SpotifyPlaylistTracksResponse(
        tracks=tracks,
        total=data.get("total", 0),
        offset=offset,
        limit=limit,
    )


def _map_track(item: dict) -> SpotifyTrack:
    artists = item.get("artists") or []
    album = item.get("album") or {}
    images = album.get("images") or []
    return SpotifyTrack(
        uri=item.get("uri"),
        name=item.get("name"),
        artist=", ".join(a.get("name") for a in artists if a.get("name")) or None,
        album=album.get("name"),
        art_url=images[0]["url"] if images else None,
        duration_ms=item.get("duration_ms"),
        # Present only when the request used a market (playlist tracks); default playable.
        is_playable=item.get("is_playable", True),
    )


def _map_playlist(p: dict) -> SpotifyPlaylist:
    images = p.get("images") or []
    tracks = p.get("tracks") or {}
    return SpotifyPlaylist(
        id=p.get("id"),
        uri=p.get("uri"),
        name=p.get("name"),
        image_url=images[0]["url"] if images else None,
        track_count=tracks.get("total"),
    )
