"""
S3 Client for Rollplay Game API
Communicates with api-site S3 service via authenticated HTTP requests
"""

import requests
import logging
import os
from typing import Dict, Optional, Any
from datetime import datetime

class S3GameClient:
    def __init__(self, site_api_url: str = None, api_key: str = None):
        """
        Initialize S3 client for game service
        
        Args:
            site_api_url: URL of api-site service (defaults to environment)
            api_key: API key for authentication (defaults to environment)
        """
        self.site_api_url = site_api_url or os.getenv('SITE_API_URL', 'http://api-site:8082')
        self.api_key = api_key or os.getenv('SITE_API_KEY', 'rollplay-game-service')
        self.logger = logging.getLogger(__name__)
        
        # Configure requests session with default headers
        self.session = requests.Session()
        self.session.headers.update({
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json',
            'User-Agent': 'Rollplay-Game-Service/1.0'
        })
        
        self.logger.info(f"S3GameClient initialized - Site API: {self.site_api_url}")
    
    def _make_request(self, method: str, endpoint: str, **kwargs) -> Optional[Dict[str, Any]]:
        """
        Make authenticated request to api-site
        
        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint path
            **kwargs: Additional request parameters
        
        Returns:
            Response JSON or None if error
        """
        url = f"{self.site_api_url}{endpoint}"
        
        try:
            response = self.session.request(method, url, timeout=10, **kwargs)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.Timeout:
            self.logger.error(f"Timeout connecting to api-site: {url}")
            return {"error": "Site API timeout"}
        except requests.exceptions.ConnectionError:
            self.logger.error(f"Connection error to api-site: {url}")
            return {"error": "Site API unavailable"}
        except requests.exceptions.RequestException as e:
            self.logger.error(f"Request failed to api-site: {e}")
            return {"error": f"Site API error: {str(e)}"}
        except Exception as e:
            self.logger.error(f"Unexpected error: {e}")
            return {"error": f"Unexpected error: {str(e)}"}
    
    def list_game_assets(self, asset_type: str = None) -> Dict[str, Any]:
        """
        List game assets from S3 via api-site
        
        Args:
            asset_type: Optional filter for asset type ('maps', 'audio', 'images')
        
        Returns:
            Dictionary with categorized assets
        """
        endpoint = "/s3/assets"
        params = {"asset_type": asset_type} if asset_type else {}
        
        result = self._make_request("GET", endpoint, params=params)
        
        if result and "error" not in result:
            self.logger.info(f"Retrieved {result.get('total_objects', 0)} game assets")
        else:
            self.logger.warning(f"Failed to retrieve game assets: {result}")
        
        return result or {"error": "Failed to retrieve assets"}
    
    def get_assets_with_presigned_urls(self, asset_type: str = None) -> Dict[str, Any]:
        """
        Get game assets with presigned URLs via api-site
        
        Args:
            asset_type: Optional filter for asset type
        
        Returns:
            Dictionary with assets and presigned URLs
        """
        endpoint = "/s3/assets/with-urls"
        params = {"asset_type": asset_type} if asset_type else {}
        
        result = self._make_request("GET", endpoint, params=params)
        
        if result and "error" not in result:
            self.logger.info(f"Retrieved {result.get('total_objects', 0)} assets with URLs")
        else:
            self.logger.warning(f"Failed to retrieve assets with URLs: {result}")
        
        return result or {"error": "Failed to retrieve assets with URLs"}
    
    def get_asset_with_presigned_url(self, object_key: str) -> Optional[Dict[str, Any]]:
        """
        Get specific asset with presigned URL via api-site
        
        Args:
            object_key: S3 object key (file path)
        
        Returns:
            Asset metadata with presigned URL or None
        """
        endpoint = f"/s3/assets/{object_key}"
        
        result = self._make_request("GET", endpoint)
        
        if result and "error" not in result:
            self.logger.info(f"Retrieved asset: {object_key}")
            return result
        else:
            self.logger.warning(f"Failed to retrieve asset {object_key}: {result}")
            return None
    
    def generate_presigned_url(self, object_key: str, expiry: int = None) -> Optional[str]:
        """
        Generate presigned URL for specific asset via api-site
        
        Args:
            object_key: S3 object key (file path)
            expiry: URL expiry time in seconds (optional)
        
        Returns:
            Presigned URL string or None
        """
        endpoint = f"/s3/assets/{object_key}/url"
        params = {"expiry": expiry} if expiry else {}
        
        result = self._make_request("GET", endpoint, params=params)
        
        if result and "error" not in result:
            presigned_url = result.get("presigned_url")
            self.logger.info(f"Generated presigned URL for {object_key}")
            return presigned_url
        else:
            self.logger.warning(f"Failed to generate presigned URL for {object_key}: {result}")
            return None
    
    def check_s3_health(self) -> Dict[str, Any]:
        """
        Check S3 health via api-site
        
        Returns:
            Health status dictionary
        """
        endpoint = "/s3/health"
        
        result = self._make_request("GET", endpoint)
        
        if result and "error" not in result:
            self.logger.info(f"S3 health check: {result.get('accessible', False)}")
        else:
            self.logger.warning(f"S3 health check failed: {result}")
        
        return result or {"accessible": False, "error": "Health check failed"}
    
    def get_asset_metadata(self, object_key: str) -> Optional[Dict[str, Any]]:
        """
        Get asset metadata via api-site
        
        Args:
            object_key: S3 object key (file path)
        
        Returns:
            Asset metadata or None
        """
        endpoint = f"/s3/assets/{object_key}"
        
        result = self._make_request("GET", endpoint)
        
        if result and "error" not in result:
            # Remove presigned URL for metadata-only requests
            metadata = result.copy()
            metadata.pop("presigned_url", None)
            metadata.pop("url_expires_in", None)
            return metadata
        else:
            self.logger.warning(f"Failed to get metadata for {object_key}: {result}")
            return None

# Global client instance
s3_game_client = S3GameClient() 