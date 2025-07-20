# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import os
import jwt
from datetime import datetime
from typing import Optional, Dict, Any
from fastapi import HTTPException, Request
import logging

logger = logging.getLogger(__name__)

class JWTHelper:
    """
    JWT token verification for api-site service
    Validates tokens created by api-auth service
    """
    
    def __init__(self):
        self.secret_key = os.getenv("JWT_SECRET_KEY")
        if not self.secret_key:
            raise ValueError("JWT_SECRET_KEY environment variable is required")
        self.algorithm = "HS256"
    
    def verify_auth_token(self, token: str) -> Optional[str]:
        """
        Verify JWT access token and return email if valid
        
        Args:
            token: JWT token string
            
        Returns:
            Email string if token is valid, None otherwise
        """
        try:
            # Decode token
            payload = jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
            
            # Check token type
            if payload.get("type") != "access":
                logger.warning(f"Invalid token type: {payload.get('type')}")
                return None
            
            # Extract email
            email = payload.get("email")
            if not email:
                logger.warning("Token missing email")
                return None
                
            logger.info(f"Successfully verified token for: {email}")
            return email
            
        except jwt.ExpiredSignatureError:
            logger.warning("JWT token has expired")
            return None
        except jwt.InvalidTokenError as e:
            logger.warning(f"Invalid JWT token: {str(e)}")
            return None
        except Exception as e:
            logger.error(f"Error verifying JWT token: {str(e)}")
            return None
    
    def get_token_from_cookie(self, request: Request) -> Optional[str]:
        """
        Extract JWT token from auth_token cookie
        
        Args:
            request: FastAPI Request object
            
        Returns:
            Token string if found, None otherwise
        """
        try:
            token = request.cookies.get("auth_token")
            return token
        except Exception as e:
            logger.error(f"Error extracting token from cookie: {str(e)}")
            return None