# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import Optional, Dict, Any
import logging

import httpx

from .email_service import EmailService
from .jwt_handler import JWTHandler
from .redis_client import RedisClient
from .short_code_generator import ShortCodeGenerator

logger = logging.getLogger(__name__)

class PasswordlessAuth:
    """
    Handles passwordless authentication using magic links
    """

    def __init__(self, settings):
        self.settings = settings
        self.email_service = EmailService(settings)
        self.jwt_handler = JWTHandler(settings)
        self.redis_client = RedisClient(settings.REDIS_URL)
        self.short_code_generator = ShortCodeGenerator()
        self.api_site_url = settings.API_SITE_INTERNAL_URL
        # Local cache for user data within request lifecycle (not persistent)
        self._user_cache = {}  # email -> user_data
        
    async def send_magic_link(self, email: str) -> dict:
        """
        Generate and send a magic link to the user's email
        """
        try:
            # Validate user exists or will be created (optional pre-check)
            # Note: We don't need user_data for magic link generation, just email
            # The user will be fetched/created when the magic link is verified
            
            # Generate JWT magic link token
            magic_token = self.jwt_handler.create_magic_token(email)
            
            # Generate magic link URL for frontend page (query parameter)
            magic_link_url = f"{self.settings.NEXT_PUBLIC_API_URL}/auth/verify?token={magic_token}"
            
            # Generate short code and store it mapped to the JWT
            short_code = self.short_code_generator.generate_code()
            code_stored = self.redis_client.set_short_code(short_code, magic_token, expire_minutes=15)
            
            if not code_stored:
                logger.warning(f"Failed to store short code for {email}, continuing with JWT-only")
                short_code = None
            else:
                logger.info(f"Generated short code {short_code} for {email}")
            
            # Send email with both link and short code
            email_result = await self.email_service.send_magic_link_email(
                email, 
                magic_link_url, 
                short_code=short_code,
                jwt_token=magic_token  # Still include full JWT as fallback
            )
            
            if email_result["success"]:
                logger.info(f"Magic link generated and sent successfully for {email}")
                return {
                    "success": True,
                    "message": "Magic link sent successfully",
                    "email_response": email_result,
                    "magic_link_url": magic_link_url  # For debugging
                }
            else:
                logger.error(f"Failed to send magic link email to {email}: {email_result.get('error', 'Unknown error')}")
                return {
                    "success": False,
                    "message": "Failed to send magic link email",
                    "email_response": email_result
                }
            
        except Exception as e:
            logger.error(f"Error sending magic link to {email}: {str(e)}")
            return {
                "success": False,
                "message": f"Error generating magic link: {str(e)}",
                "error": str(e)
            }
    
    async def verify_magic_link(self, token: str) -> Optional[Dict[str, Any]]:
        """
        Verify magic link token and return user data with JWT access token
        """
        try:
            # Verify magic link token using JWT handler
            email = self.jwt_handler.verify_magic_token(token)
            if not email:
                return None
            
            # Get or create user from api-site (gets real PostgreSQL user_id)
            user_data = await self._get_or_create_user(email)

            # Generate access and refresh tokens with real user_id
            tokens = self.jwt_handler.create_tokens(user_data)

            # Return user data with tokens
            result = {
                "user": user_data,
                "access_token": tokens["access_token"],
                "refresh_token": tokens["refresh_token"],
                "token_type": "bearer"
            }

            logger.info(f"Successfully verified magic link for {email}")

            return result

        except Exception as e:
            logger.error(f"Error verifying magic link: {str(e)}")
            raise

    async def verify_otp_token(self, token: str) -> Optional[Dict[str, Any]]:
        """
        Verify OTP token manually typed by the user
        Accepts both short codes and full JWT tokens
        """
        try:
            jwt_token = None
            auth_method = "unknown"
            
            # Check if it looks like a short code (6 characters, alphanumeric)
            if self.short_code_generator.validate_code_format(token.strip().upper()):
                auth_method = "short_code"
                # Try to get JWT from short code
                jwt_token = self.redis_client.get_jwt_from_short_code(token.strip().upper())
                if jwt_token:
                    logger.info(f"Retrieved JWT from short code: {token.strip().upper()}")
                    # Delete short code for one-time use
                    self.redis_client.delete_short_code(token.strip().upper())
                else:
                    logger.info(f"Short code not found or expired: {token.strip().upper()}")
                    return None
            else:
                auth_method = "jwt_token"
                # Assume it's a full JWT token
                jwt_token = token.strip()
                logger.info("Using provided JWT token directly")
            
            # Verify the JWT token
            email = self.jwt_handler.verify_magic_token(jwt_token)
            if not email:
                logger.info(f"JWT verification failed for {auth_method}")
                return None

            # Get or create user from api-site (gets real PostgreSQL user_id)
            user_data = await self._get_or_create_user(email)

            # Generate access and refresh tokens with real user_id
            tokens = self.jwt_handler.create_tokens(user_data)

            # Return user data with tokens
            result = {
                "user": user_data,
                "access_token": tokens["access_token"],
                "refresh_token": tokens["refresh_token"],
                "token_type": "bearer"
            }

            logger.info(f"Successfully verified OTP via {auth_method} for {email}")
            
            return result
            
        except Exception as e:
            logger.error(f"Error verifying OTP token: {str(e)}")
            return None
    
    async def _get_or_create_user(self, email: str) -> Dict[str, Any]:
        """
        Get existing user or create new one via api-site.

        This calls api-site's /api/users/login endpoint which uses GetOrCreateUser
        to ensure we get the REAL user_id from PostgreSQL.
        """
        # Check local cache first (for within same request)
        if email in self._user_cache:
            return self._user_cache[email]

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    f"{self.api_site_url}/api/users/login",
                    json={"email": email}
                )

                if response.status_code == 200:
                    result = response.json()
                    user_response = result.get("user", {})

                    # Map api-site response to format expected by jwt_handler
                    user_data = {
                        "id": user_response.get("id"),
                        "email": user_response.get("email"),
                        "display_name": user_response.get("screen_name") or email.split("@")[0],
                        "created_at": user_response.get("created_at"),
                        "last_login": user_response.get("last_login")
                    }

                    # Cache for this request lifecycle
                    self._user_cache[email] = user_data
                    logger.info(f"Got user from api-site: {email} (id={user_data['id']})")
                    return user_data
                else:
                    logger.error(f"api-site login failed for {email}: {response.status_code} - {response.text}")
                    raise Exception(f"Failed to get/create user from api-site: {response.status_code}")

        except httpx.RequestError as e:
            logger.error(f"Network error calling api-site for {email}: {str(e)}")
            raise Exception(f"Failed to connect to api-site: {str(e)}")

    def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """
        Get user data by email from cache.
        Note: This only returns cached data from current session.
        """
        return self._user_cache.get(email)

    def get_user_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get user data by ID from cache.
        Note: This only returns cached data from current session.
        """
        for user in self._user_cache.values():
            if user["id"] == user_id:
                return user
        return None