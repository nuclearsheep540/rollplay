# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
HTTP client for proxying requests to api-site.

Instead of duplicating S3 logic, api-game proxies asset requests to api-site
which handles all S3 presigned URL generation.
"""

import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# api-site runs on port 8082 within docker network
API_SITE_BASE_URL = "http://api-site:8082"


class ApiSiteClient:
    """HTTP client for calling api-site endpoints."""

    def __init__(self, base_url: str = API_SITE_BASE_URL):
        self.base_url = base_url

    async def get_campaign_assets(
        self,
        campaign_id: str,
        auth_token: str,
        asset_type: Optional[str] = None
    ) -> dict:
        """
        Get assets for a campaign from api-site.

        Proxies to: GET /api/library/?campaign_id=X

        Args:
            campaign_id: The PostgreSQL campaign UUID
            auth_token: User's auth token (from cookie)
            asset_type: Optional filter by type (map, audio, image)

        Returns:
            Response from api-site library endpoint with presigned URLs
        """
        headers = {"Cookie": f"auth_token={auth_token}"}
        params = {"campaign_id": campaign_id}
        if asset_type:
            params["asset_type"] = asset_type

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.base_url}/api/library/",
                    headers=headers,
                    params=params
                )

                if response.status_code == 200:
                    return response.json()
                else:
                    logger.error(f"api-site error {response.status_code}: {response.text}")
                    return {"assets": [], "total": 0, "error": response.text}

        except httpx.RequestError as e:
            logger.error(f"Network error calling api-site: {e}")
            return {"assets": [], "total": 0, "error": str(e)}

    async def get_upload_url(
        self,
        filename: str,
        content_type: str,
        asset_type: str,
        auth_token: str
    ) -> dict:
        """
        Get presigned upload URL from api-site.

        Proxies to: GET /api/library/upload-url

        Args:
            filename: Original filename
            content_type: MIME type (e.g., image/png)
            asset_type: Asset type (map, audio, image)
            auth_token: User's auth token

        Returns:
            {upload_url, key} from api-site
        """
        headers = {"Cookie": f"auth_token={auth_token}"}
        params = {
            "filename": filename,
            "content_type": content_type,
            "asset_type": asset_type
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.base_url}/api/library/upload-url",
                    headers=headers,
                    params=params
                )

                if response.status_code == 200:
                    return response.json()
                else:
                    logger.error(f"api-site upload-url error {response.status_code}: {response.text}")
                    return {"error": response.text}

        except httpx.RequestError as e:
            logger.error(f"Network error getting upload URL: {e}")
            return {"error": str(e)}

    async def confirm_upload(
        self,
        key: str,
        asset_type: str,
        campaign_id: str,
        auth_token: str,
        file_size: Optional[int] = None
    ) -> dict:
        """
        Confirm upload and create asset record via api-site.

        Proxies to: POST /api/library/confirm

        Args:
            key: S3 object key from upload URL response
            asset_type: Asset type (map, audio, image)
            campaign_id: Campaign to associate with
            auth_token: User's auth token
            file_size: Optional file size in bytes

        Returns:
            Created asset from api-site
        """
        headers = {
            "Cookie": f"auth_token={auth_token}",
            "Content-Type": "application/json"
        }
        payload = {
            "key": key,
            "asset_type": asset_type,
            "campaign_id": campaign_id
        }
        if file_size:
            payload["file_size"] = file_size

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    f"{self.base_url}/api/library/confirm",
                    headers=headers,
                    json=payload
                )

                if response.status_code == 200:
                    return response.json()
                else:
                    logger.error(f"api-site confirm error {response.status_code}: {response.text}")
                    return {"error": response.text}

        except httpx.RequestError as e:
            logger.error(f"Network error confirming upload: {e}")
            return {"error": str(e)}

    async def get_user_library(
        self,
        auth_token: str,
        asset_type: Optional[str] = None
    ) -> dict:
        """
        Get all assets in user's library (no campaign filter).

        Proxies to: GET /api/library/

        Args:
            auth_token: User's auth token (from cookie)
            asset_type: Optional filter by type (map, audio, image)

        Returns:
            Response from api-site library endpoint with presigned URLs
        """
        headers = {"Cookie": f"auth_token={auth_token}"}
        params = {}
        if asset_type:
            params["asset_type"] = asset_type

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.base_url}/api/library/",
                    headers=headers,
                    params=params
                )

                if response.status_code == 200:
                    return response.json()
                else:
                    logger.error(f"api-site user library error {response.status_code}: {response.text}")
                    return {"assets": [], "total": 0, "error": response.text}

        except httpx.RequestError as e:
            logger.error(f"Network error getting user library: {e}")
            return {"assets": [], "total": 0, "error": str(e)}

    async def associate_asset(
        self,
        asset_id: str,
        campaign_id: str,
        auth_token: str
    ) -> dict:
        """
        Associate an asset with a campaign.

        Proxies to: POST /api/library/{asset_id}/associate

        Args:
            asset_id: The asset UUID to associate
            campaign_id: The campaign UUID to associate with
            auth_token: User's auth token

        Returns:
            Updated asset from api-site
        """
        headers = {
            "Cookie": f"auth_token={auth_token}",
            "Content-Type": "application/json"
        }
        payload = {"campaign_id": campaign_id}

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    f"{self.base_url}/api/library/{asset_id}/associate",
                    headers=headers,
                    json=payload
                )

                if response.status_code == 200:
                    return response.json()
                else:
                    logger.error(f"api-site associate error {response.status_code}: {response.text}")
                    return {"error": response.text}

        except httpx.RequestError as e:
            logger.error(f"Network error associating asset: {e}")
            return {"error": str(e)}


# Singleton instance
_api_site_client: Optional[ApiSiteClient] = None


def get_api_site_client() -> ApiSiteClient:
    """Get the ApiSiteClient singleton."""
    global _api_site_client
    if _api_site_client is None:
        _api_site_client = ApiSiteClient()
    return _api_site_client
