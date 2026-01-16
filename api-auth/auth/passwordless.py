# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import uuid
from datetime import datetime
from typing import Optional, Dict, Any
import logging

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
        # In production, this would be a database or Redis
        self.users = {}  # email -> user_data
        
    async def send_magic_link(self, email: str) -> dict:
        """
        Generate and send a magic link to the user's email
        """
        try:
            # Create or get user (for user creation tracking)
            user_data = self._get_or_create_user(email)
            
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
            
            # Get or create user
            user_data = self._get_or_create_user(email)
            
            # Update last login
            user_data["last_login"] = datetime.utcnow().isoformat()
            self.users[email] = user_data
            
            # Generate access token
            access_token = self.jwt_handler.create_token(user_data)
            
            # Return user data with access token
            result = {
                "user": user_data,
                "access_token": access_token,
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

            # Get or create user
            user_data = self._get_or_create_user(email)
            
            # Update last login
            user_data["last_login"] = datetime.utcnow().isoformat()
            self.users[email] = user_data

            # Generate access token
            access_token = self.jwt_handler.create_token(user_data)

            # Return user data with access token
            result = {
                "user": user_data,
                "access_token": access_token,
                "token_type": "bearer"
            }
            
            logger.info(f"Successfully verified OTP via {auth_method} for {email}")
            
            return result
            
        except Exception as e:
            logger.error(f"Error verifying OTP token: {str(e)}")
            return None
    
    def _get_or_create_user(self, email: str) -> Dict[str, Any]:
        """
        Get existing user or create new one
        """
        if email in self.users:
            return self.users[email]
        
        # Create new user
        user_data = {
            "id": str(uuid.uuid4()),
            "email": email,
            "display_name": email.split("@")[0],  # Default display name
            "created_at": datetime.utcnow().isoformat(),
            "last_login": None
        }
        
        self.users[email] = user_data
        logger.info(f"Created new user: {email}")
        
        return user_data
    
    def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """
        Get user data by email
        """
        return self.users.get(email)
    
    def get_user_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get user data by ID
        """
        for user in self.users.values():
            if user["id"] == user_id:
                return user
        return None