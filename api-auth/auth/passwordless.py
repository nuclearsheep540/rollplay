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
        # NOTE: No caching - always fetch fresh from api-site to handle account deletion/recreation
        
    async def _get_screen_name(self, email: str) -> Optional[str]:
        """Get user's screen_name from api-site. Returns None if not found or on error."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(
                    f"{self.api_site_url}/api/users/internal/check-email",
                    params={"email": email}
                )
                if response.status_code == 200:
                    return response.json().get("screen_name")
        except Exception as e:
            logger.warning(f"Could not check user for {email}: {e}")
        return None

    async def send_magic_link(self, email: str) -> dict:
        """
        Generate and send a magic link to the user's email.
        Determines new vs returning user and dispatches the appropriate email.
        """
        try:
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

            formatted_code = f"{short_code[:3]} {short_code[3:]}" if short_code and len(short_code) == 6 else short_code

            # Determine new vs returning user and send appropriate email
            screen_name = await self._get_screen_name(email)

            if screen_name:
                email_result = await self.email_service.send_returning_user_otp(
                    to_email=email,
                    magic_link=magic_link_url,
                    formatted_code=formatted_code,
                    screen_name=screen_name,
                    expiry_minutes=15,
                    site_url=self.settings.NEXT_PUBLIC_API_URL,
                )
            else:
                email_result = await self.email_service.send_new_user_otp(
                    to_email=email,
                    magic_link=magic_link_url,
                    formatted_code=formatted_code,
                    expiry_minutes=15,
                    site_url=self.settings.NEXT_PUBLIC_API_URL,
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
            
            # Resolve user_id from api-site (gets real PostgreSQL user_id)
            user_data = await self._resolve_user_for_token(email)

            # Generate access and refresh tokens with real user_id
            tokens = self.jwt_handler.create_tokens(user_data)

            # Return tokens (user_data is minimal - just id and email)
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

            # Resolve user_id from api-site (gets real PostgreSQL user_id)
            user_data = await self._resolve_user_for_token(email)

            # Generate access and refresh tokens with real user_id
            tokens = self.jwt_handler.create_tokens(user_data)

            # Return tokens (user_data is minimal - just id and email)
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
    
    async def _resolve_user_for_token(self, email: str) -> Dict[str, str]:
        """
        Resolve user_id from email via api-site internal endpoint.

        Calls api-site's /api/users/internal/resolve-user endpoint which:
        - Returns existing user's ID if found
        - Creates new user and returns ID if not found

        Returns minimal data needed for JWT token creation: { id, email }

        NOTE: No caching - always fetch fresh to handle account deletion/recreation.
        """
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    f"{self.api_site_url}/api/users/internal/resolve-user",
                    json={"email": email}
                )

                if response.status_code == 200:
                    # Response is exactly what we need: { user_id, email }
                    data = response.json()
                    logger.info(f"Resolved user from api-site: {email} (id={data['user_id']})")
                    # Map to format jwt_handler expects (id, not user_id)
                    return {
                        "id": data["user_id"],
                        "email": data["email"]
                    }
                else:
                    logger.error(f"api-site resolve-user failed for {email}: {response.status_code} - {response.text}")
                    raise Exception(f"Failed to resolve user from api-site: {response.status_code}")

        except httpx.RequestError as e:
            logger.error(f"Network error calling api-site for {email}: {str(e)}")
            raise Exception(f"Failed to connect to api-site: {str(e)}")

