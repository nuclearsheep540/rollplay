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
            logger.debug(f"Verifying token with secret key: {self.secret_key[:20]}...")

            # Decode token
            payload = jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
            logger.debug(f"Token decoded successfully. Payload keys: {list(payload.keys())}")

            # Check token type
            token_type = payload.get("type")
            logger.debug(f"Token type: {token_type}")
            if token_type != "access":
                logger.debug(f"Invalid token type. Expected 'access', got '{token_type}'")
                return None

            # Extract email
            email = payload.get("email")
            logger.debug(f"Email from token: {email}")
            if not email:
                logger.debug("Token missing email field")
                return None

            logger.info(f"Token verified for user: {email}")
            return email

        except jwt.ExpiredSignatureError:
            logger.debug("JWT token has expired")
            return None
        except jwt.InvalidTokenError as e:
            logger.debug(f"Invalid JWT token error: {str(e)}")
            return None
        except Exception as e:
            logger.debug(f"Exception verifying JWT token: {str(e)}")
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
            if token:
                logger.debug(f"Found auth_token cookie: {token[:50]}...")
            else:
                logger.debug("No auth_token cookie found in request")
            return token
        except Exception as e:
            logger.debug(f"Error extracting token from cookie: {str(e)}")
            return None