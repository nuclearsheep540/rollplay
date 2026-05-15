# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import hmac
import os
import uuid

from fastapi import APIRouter, HTTPException
from livekit import api
from pydantic import BaseModel

router = APIRouter()

LIVEKIT_API_KEY = os.environ.get("LIVEKIT_API_KEY")
LIVEKIT_API_SECRET = os.environ.get("LIVEKIT_API_SECRET")
LIVEKIT_URL = os.environ.get("LIVEKIT_URL")

DEFAULT_ROOM = "sandbox-main"

# Gate for /sandbox/stream/broadcast. Anyone who knows STREAM_PASS can
# publish screen-share to the LiveKit project. Set it in .env.
BROADCAST_PASSWORD = os.environ.get("STREAM_PASS")


class PublisherTokenRequest(BaseModel):
    password: str


def _require_credentials() -> None:
    if not LIVEKIT_API_KEY or not LIVEKIT_API_SECRET:
        raise HTTPException(
            status_code=503,
            detail="LiveKit credentials not configured on the server",
        )


@router.post("/ingress")
async def create_ingress():
    """Provision a new WHIP ingress for OBS. Hit this once; copy the
    returned `url` and `stream_key` into OBS Settings → Stream (Service:
    WHIP). After that, OBS will publish into the `sandbox-main` room and
    viewers on /sandbox/stream will see it."""
    _require_credentials()
    if not LIVEKIT_URL:
        raise HTTPException(status_code=503, detail="LIVEKIT_URL not configured")

    lkapi = api.LiveKitAPI(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
    try:
        info = await lkapi.ingress.create_ingress(
            api.CreateIngressRequest(
                input_type=api.IngressInput.WHIP_INPUT,
                name="sandbox-whip",
                room_name=DEFAULT_ROOM,
                participant_identity="obs-publisher",
                participant_name="OBS",
            )
        )
    finally:
        await lkapi.aclose()

    return {
        "ingress_id": info.ingress_id,
        "url": info.url,
        "stream_key": info.stream_key,
        "room": DEFAULT_ROOM,
    }


@router.get("/ingresses")
async def list_ingresses():
    """List existing ingresses on the LiveKit project. Useful for
    checking what's already provisioned before creating a new one."""
    _require_credentials()
    if not LIVEKIT_URL:
        raise HTTPException(status_code=503, detail="LIVEKIT_URL not configured")

    lkapi = api.LiveKitAPI(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
    try:
        result = await lkapi.ingress.list_ingress(api.ListIngressRequest())
    finally:
        await lkapi.aclose()

    return {
        "items": [
            {
                "ingress_id": i.ingress_id,
                "name": i.name,
                "room_name": i.room_name,
                "url": i.url,
                "stream_key": i.stream_key,
                "input_type": api.IngressInput.Name(i.input_type),
            }
            for i in result.items
        ]
    }


@router.delete("/ingress/{ingress_id}")
async def delete_ingress(ingress_id: str):
    """Delete a previously-provisioned ingress."""
    _require_credentials()
    if not LIVEKIT_URL:
        raise HTTPException(status_code=503, detail="LIVEKIT_URL not configured")

    lkapi = api.LiveKitAPI(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
    try:
        await lkapi.ingress.delete_ingress(
            api.DeleteIngressRequest(ingress_id=ingress_id)
        )
    finally:
        await lkapi.aclose()

    return {"deleted": ingress_id}


@router.post("/publisher-token")
async def publisher_token(request: PublisherTokenRequest):
    """Mint a publisher AccessToken for the browser broadcaster page.
    Requires the shared password to keep public abuse out."""
    _require_credentials()
    expected = BROADCAST_PASSWORD
    if not expected:
        raise HTTPException(status_code=503, detail="STREAM_PASS not configured on the server")
    if not hmac.compare_digest(request.password, expected):
        raise HTTPException(status_code=403, detail="Invalid password")

    token = (
        api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
        .with_identity(f"publisher-{uuid.uuid4().hex[:8]}")
        .with_grants(
            api.VideoGrants(
                room_join=True,
                room=DEFAULT_ROOM,
                can_publish=True,
                can_subscribe=False,
            )
        )
    )
    return {"token": token.to_jwt(), "room": DEFAULT_ROOM}


@router.get("/viewer-token")
async def viewer_token():
    _require_credentials()
    token = (
        api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
        .with_identity(f"viewer-{uuid.uuid4().hex[:8]}")
        .with_grants(
            api.VideoGrants(
                room_join=True,
                room=DEFAULT_ROOM,
                can_publish=False,
                can_subscribe=True,
            )
        )
    )
    return {"token": token.to_jwt(), "room": DEFAULT_ROOM}
