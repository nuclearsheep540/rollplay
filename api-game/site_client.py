# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Async httpx client for api-site internal calls.

Follows the same pattern as api-auth/auth/passwordless.py — Docker-network
only, no JWT, no API key.
"""

import logging
import httpx

from config.settings import get_settings

logger = logging.getLogger(__name__)

CONFIG = get_settings()
API_SITE_URL = CONFIG.get("API_SITE_URL", "http://api-site:8082")


async def request_role_change(
    campaign_id: str,
    requesting_user_id: str,
    target_user_id: str,
    new_role: str,
) -> dict:
    """Ask api-site to change a campaign member's role.

    Returns the parsed JSON response on success.
    Raises ValueError on 400 (api-site rejected the request).
    Raises Exception on network error or unexpected status.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{API_SITE_URL}/api/campaigns/set-role",
                json={
                    "campaign_id": campaign_id,
                    "requesting_user_id": requesting_user_id,
                    "target_user_id": target_user_id,
                    "new_role": new_role,
                },
            )

            if response.status_code == 200:
                data = response.json()
                logger.info(
                    f"Role change approved by api-site: {target_user_id} → {new_role}"
                )
                return data

            detail = response.json().get("detail", response.text)
            if response.status_code == 400:
                logger.warning(f"Role change rejected by api-site: {detail}")
                raise ValueError(detail)

            logger.error(
                f"Unexpected response from api-site: {response.status_code} - {detail}"
            )
            raise Exception(f"api-site returned {response.status_code}: {detail}")

    except httpx.RequestError as e:
        logger.error(f"Network error calling api-site for role change: {e}")
        raise Exception(f"Failed to connect to api-site: {e}")
