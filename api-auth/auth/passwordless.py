# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import os
import secrets
import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import logging

from .email_service import EmailService

logger = logging.getLogger(__name__)

class PasswordlessAuth:
    """
    Handles passwordless authentication using magic links
    """
    
    def __init__(self, settings):
        self.settings = settings
        self.email_service = EmailService(settings)
        # In production, this would be a database or Redis
        self.magic_links = {}  # token -> {email, expires_at, user_data}
        self.users = {}  # email -> user_data
        
    async def send_magic_link(self, email: str) -> str:
        """
        Generate and send a magic link to the user's email
        """
        try:
            # Generate secure token
            token = secrets.token_urlsafe(32)
            
            # Create or get user
            user_data = self._get_or_create_user(email)
            
            # Store magic link with expiration (15 minutes)
            expires_at = datetime.utcnow() + timedelta(minutes=15)
            self.magic_links[token] = {
                "email": email,
                "expires_at": expires_at,
                "user_data": user_data
            }
            
            # Generate magic link URL
            magic_link_url = f"{self.settings.frontend_url}/auth/verify?token={token}"
            
            # Send email
            await self.email_service.send_magic_link_email(email, magic_link_url)
            
            logger.info(f"Magic link generated for {email}, expires at {expires_at}")
            
            return magic_link_url
            
        except Exception as e:
            logger.error(f"Error sending magic link to {email}: {str(e)}")
            raise
    
    async def verify_magic_link(self, token: str) -> Optional[Dict[str, Any]]:
        """
        Verify magic link token and return user data
        """
        try:
            if token not in self.magic_links:
                logger.warning(f"Invalid magic link token: {token}")
                return None
            
            link_data = self.magic_links[token]
            
            # Check if token has expired
            if datetime.utcnow() > link_data["expires_at"]:
                logger.warning(f"Expired magic link token for {link_data['email']}")
                # Clean up expired token
                del self.magic_links[token]
                return None
            
            # Get user data
            user_data = link_data["user_data"]
            
            # Update last login
            user_data["last_login"] = datetime.utcnow().isoformat()
            self.users[user_data["email"]] = user_data
            
            # Clean up used token
            del self.magic_links[token]
            
            logger.info(f"Successfully verified magic link for {user_data['email']}")
            
            return user_data
            
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