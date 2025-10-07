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
            print(f"🔍 DEBUG: Verifying token with secret key: {self.secret_key[:20]}...")
            
            # Decode token
            payload = jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
            print(f"🔍 DEBUG: Token decoded successfully. Payload keys: {list(payload.keys())}")
            
            # Check token type
            token_type = payload.get("type")
            print(f"🔍 DEBUG: Token type: {token_type}")
            if token_type != "access":
                print(f"🔍 DEBUG: Invalid token type. Expected 'access', got '{token_type}'")
                logger.warning(f"Invalid token type: {payload.get('type')}")
                return None
            
            # Extract email
            email = payload.get("email")
            print(f"🔍 DEBUG: Email from token: {email}")
            if not email:
                print("🔍 DEBUG: Token missing email field")
                logger.warning("Token missing email")
                return None
                
            print(f"🔍 DEBUG: Successfully verified token for: {email}")
            logger.info(f"Successfully verified token for: {email}")
            return email
            
        except jwt.ExpiredSignatureError:
            print("🔍 DEBUG: JWT token has expired")
            logger.warning("JWT token has expired")
            return None
        except jwt.InvalidTokenError as e:
            print(f"🔍 DEBUG: Invalid JWT token error: {str(e)}")
            logger.warning(f"Invalid JWT token: {str(e)}")
            return None
        except Exception as e:
            print(f"🔍 DEBUG: Exception verifying JWT token: {str(e)}")
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
            # Debug: Log all cookies received
            all_cookies = request.cookies
            logger.info(f"All cookies received: {list(all_cookies.keys())}")
            if all_cookies:
                for name, value in all_cookies.items():
                    logger.info(f"Cookie '{name}': {value[:50]}..." if len(value) > 50 else f"Cookie '{name}': {value}")
            
            token = request.cookies.get("auth_token")
            if token:
                logger.info(f"Found auth_token cookie: {token[:50]}...")
            else:
                logger.warning("No auth_token cookie found in request")
            return token
        except Exception as e:
            logger.error(f"Error extracting token from cookie: {str(e)}")
            return None