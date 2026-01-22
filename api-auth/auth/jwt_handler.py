# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import os
import jwt
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from fastapi import HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import logging

logger = logging.getLogger(__name__)

class JWTHandler:
    """
    Handles JWT token creation and validation for both magic links and auth tokens
    """
    
    def __init__(self, settings):
        self.settings = settings
        self.secret_key = settings.JWT_SECRET_KEY
        self.algorithm = "HS256"
        self.access_token_expire_minutes = 15  # 15 minutes for access tokens
        self.refresh_token_expire_days = 7  # 7 days for refresh tokens
        self.magic_token_expire_minutes = 15  # 15 minutes for magic links
        
    def create_token(self, user_data: Dict[str, Any]) -> str:
        """
        Create JWT token for user
        """
        try:
            # Token payload
            payload = {
                "user_id": user_data["id"],
                "email": user_data["email"],
                "display_name": user_data.get("display_name"),
                "exp": datetime.utcnow() + timedelta(minutes=self.access_token_expire_minutes),
                "iat": datetime.utcnow(),
                "type": "access"
            }
            
            # Generate token
            token = jwt.encode(payload, self.secret_key, algorithm=self.algorithm)
            
            logger.info(f"Generated JWT token for user: {user_data['email']}")
            
            return token
            
        except Exception as e:
            logger.error(f"Error creating JWT token: {str(e)}")
            raise
    
    def create_magic_token(self, email: str) -> str:
        """
        Create a short-lived magic link token
        """
        try:
            payload = {
                "email": email,
                "exp": datetime.utcnow() + timedelta(minutes=self.magic_token_expire_minutes),
                "iat": datetime.utcnow(),
                "type": "magic_link",
                "iss": "tabletop-tavern-auth",
                "aud": "tabletop-tavern"
            }
            
            token = jwt.encode(payload, self.secret_key, algorithm=self.algorithm)
            
            logger.info(f"Generated magic link token for: {email}")
            logger.info(f"Token length: {len(token)} characters")
            logger.info(f"Token preview: {token[:50]}...")
            
            return token
            
        except Exception as e:
            logger.error(f"Error creating magic link token: {str(e)}")
            raise
    
    def verify_token(self, token: str) -> Optional[Dict[str, Any]]:
        """
        Verify JWT token and return user data
        """
        try:
            # Decode token
            payload = jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
            
            # Check token type
            if payload.get("type") != "access":
                logger.warning(f"Invalid token type: {payload.get('type')}")
                return None
            
            # Extract user data
            user_data = {
                "id": payload["user_id"],
                "email": payload["email"],
                "display_name": payload.get("display_name")
            }
            
            return user_data
            
        except jwt.ExpiredSignatureError:
            logger.warning("JWT token has expired")
            return None
        except jwt.InvalidTokenError as e:
            logger.warning(f"Invalid JWT token: {str(e)}")
            return None
        except Exception as e:
            logger.error(f"Error verifying JWT token: {str(e)}")
            raise
    
    def get_token_from_header(self, request: Request) -> Optional[str]:
        """
        Extract JWT token from Authorization header
        """
        try:
            auth_header = request.headers.get("Authorization")
            if not auth_header:
                return None
            
            # Check if it's a Bearer token
            if not auth_header.startswith("Bearer "):
                return None
            
            # Extract token
            token = auth_header.split(" ")[1]
            return token
            
        except Exception as e:
            logger.error(f"Error extracting token from header: {str(e)}")
            return None
    
    def get_current_user(self, request: Request) -> Dict[str, Any]:
        """
        Get current user from JWT token (for dependency injection)
        """
        try:
            token = self.get_token_from_header(request)
            if not token:
                raise HTTPException(status_code=401, detail="No authorization token provided")
            
            user_data = self.verify_token(token)
            if not user_data:
                raise HTTPException(status_code=401, detail="Invalid or expired token")
            
            return user_data
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting current user: {str(e)}")
            raise HTTPException(status_code=500, detail="Authentication failed")
    
    def verify_magic_token(self, token: str) -> Optional[str]:
        """
        Verify magic link token and return email if valid
        """
        try:
            payload = jwt.decode(
                token, 
                self.secret_key, 
                algorithms=[self.algorithm],
                options={"verify_aud": False}  # We'll verify audience manually
            )
            
            # Check token type
            if payload.get("type") != "magic_link":
                logger.warning(f"Invalid magic token type: {payload.get('type')}")
                return None
                
            # Check issuer and audience
            if payload.get("iss") != "tabletop-tavern-auth":
                logger.warning(f"Invalid magic token issuer: {payload.get('iss')}")
                return None
                
            expected_audience = "tabletop-tavern"
            actual_audience = payload.get("aud")
            if actual_audience != expected_audience:
                logger.warning(f"Invalid magic token audience. Expected: '{expected_audience}', Got: '{actual_audience}'")
                return None
            
            email = payload.get("email")
            if not email:
                logger.warning("Magic token missing email")
                return None
                
            logger.info(f"Successfully verified magic token for: {email}")
            return email
            
        except jwt.ExpiredSignatureError:
            logger.warning("Magic link token has expired")
            return None
        except jwt.InvalidTokenError as e:
            logger.warning(f"Invalid magic link token: {str(e)}")
            return None
        except Exception as e:
            logger.error(f"Error verifying magic token: {str(e)}")
            raise
    
    def create_refresh_token(self, user_data: Dict[str, Any]) -> str:
        """
        Create refresh token for user - long-lived, only used to get new access tokens.
        """
        try:
            payload = {
                "user_id": user_data["id"],
                "email": user_data["email"],
                "exp": datetime.utcnow() + timedelta(days=self.refresh_token_expire_days),
                "iat": datetime.utcnow(),
                "type": "refresh"
            }

            token = jwt.encode(payload, self.secret_key, algorithm=self.algorithm)

            logger.info(f"Generated refresh token for user: {user_data['email']}")

            return token

        except Exception as e:
            logger.error(f"Error creating refresh token: {str(e)}")
            raise

    def create_tokens(self, user_data: Dict[str, Any]) -> Dict[str, str]:
        """
        Create both access and refresh tokens for user.

        Returns:
            Dict with 'access_token' and 'refresh_token' keys
        """
        return {
            "access_token": self.create_token(user_data),
            "refresh_token": self.create_refresh_token(user_data)
        }