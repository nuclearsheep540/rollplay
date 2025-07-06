# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import os
import secrets
import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import logging

from .email_service import EmailService
from .jwt_handler import JWTHandler

logger = logging.getLogger(__name__)

class PasswordlessAuth:
    """
    Handles passwordless authentication using magic links
    """
    
    def __init__(self, settings):
        self.settings = settings
        self.email_service = EmailService(settings)
        self.jwt_handler = JWTHandler(settings)
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
            magic_link_url = f"{self.settings.frontend_url}/auth/verify?token={magic_token}"
            
            # Send email and get detailed response
            email_result = await self.email_service.send_magic_link_email(email, magic_link_url)
            
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