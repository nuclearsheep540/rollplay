"""
Authentication middleware for api-site S3 endpoints
"""

import os
from fastapi import HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import logging

logger = logging.getLogger(__name__)

# Security scheme
security = HTTPBearer()

# Valid API keys (in production, use proper JWT or database)
VALID_API_KEYS = {
    "rollplay-game-service": "Game service API key",
    "rollplay-admin": "Admin API key",
    # Add more as needed
}

def get_api_key_from_env() -> str:
    """Get API key from environment variable"""
    return os.getenv('SITE_API_KEY', 'rollplay-admin')

def validate_api_key(api_key: str) -> bool:
    """
    Validate API key against allowed keys
    
    Args:
        api_key: The API key to validate
    
    Returns:
        True if valid, False otherwise
    """
    return api_key in VALID_API_KEYS

async def authenticate_request(request: Request) -> str:
    """
    Authenticate incoming request
    
    Args:
        request: FastAPI request object
    
    Returns:
        Service name if authenticated
    
    Raises:
        HTTPException: If authentication fails
    """
    try:
        # Get authorization header
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            raise HTTPException(
                status_code=401, 
                detail="Authorization header required"
            )
        
        # Extract Bearer token
        if not auth_header.startswith('Bearer '):
            raise HTTPException(
                status_code=401,
                detail="Invalid authorization format. Use 'Bearer <token>'"
            )
        
        api_key = auth_header[7:]  # Remove 'Bearer ' prefix
        
        # Validate API key
        if not validate_api_key(api_key):
            logger.warning(f"Invalid API key attempted: {api_key[:10]}...")
            raise HTTPException(
                status_code=401,
                detail="Invalid API key"
            )
        
        # Get service name
        service_name = VALID_API_KEYS.get(api_key, "unknown")
        logger.info(f"Authenticated request from: {service_name}")
        
        return service_name
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Authentication error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Authentication service error"
        )

def get_authenticated_service(request: Request) -> str:
    """
    Get the authenticated service name (synchronous version)
    
    Args:
        request: FastAPI request object
    
    Returns:
        Service name if authenticated
    
    Raises:
        HTTPException: If authentication fails
    """
    try:
        # Get authorization header
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            raise HTTPException(
                status_code=401, 
                detail="Authorization header required"
            )
        
        # Extract Bearer token
        if not auth_header.startswith('Bearer '):
            raise HTTPException(
                status_code=401,
                detail="Invalid authorization format. Use 'Bearer <token>'"
            )
        
        api_key = auth_header[7:]  # Remove 'Bearer ' prefix
        
        # Validate API key
        if not validate_api_key(api_key):
            logger.warning(f"Invalid API key attempted: {api_key[:10]}...")
            raise HTTPException(
                status_code=401,
                detail="Invalid API key"
            )
        
        # Get service name
        service_name = VALID_API_KEYS.get(api_key, "unknown")
        logger.info(f"Authenticated request from: {service_name}")
        
        return service_name
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Authentication error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Authentication service error"
        ) 