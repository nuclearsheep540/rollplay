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
from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import RedirectResponse

from config.settings import Settings, Environment
from shared.dependencies.auth import get_current_user_id
from integrations.spotify.client import SpotifyClient, get_spotify_client
from integrations.spotify.dependencies import spotify_account_repository
from integrations.spotify.models import SpotifyAccount
from integrations.spotify.repository import SpotifyAccountRepository
from integrations.spotify.schemas import SpotifyProfile, SpotifyProfileResponse

logger = logging.getLogger(__name__)

router = APIRouter()

STATE_COOKIE = "spotify_oauth_state"
FRONTEND_ACCOUNT = "/account"


def _cookie_secure() -> bool:
    """Secure cookies in production (https); off in dev so http://127.0.0.1 works."""
    return Settings().ENVIRONMENT == Environment.production


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
        # Token likely revoked or unrecoverable — surface as disconnected so the
        # UI offers a reconnect rather than erroring.
        logger.warning("Spotify profile fetch failed for user %s: %s", user_id, e)
        return SpotifyProfileResponse(connected=False)

    return SpotifyProfileResponse(connected=True, profile=_map_profile(me))


@router.delete("/disconnect", response_model=SpotifyProfileResponse)
async def disconnect(
    user_id: UUID = Depends(get_current_user_id),
    repo: SpotifyAccountRepository = Depends(spotify_account_repository),
):
    """Unlink the user's Spotify account."""
    repo.delete(user_id)
    return SpotifyProfileResponse(connected=False)
