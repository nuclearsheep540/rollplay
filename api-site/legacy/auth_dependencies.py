# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import Depends, HTTPException, Request, status
from typing import Optional

from auth.jwt_helper import JWTHelper
from dependencies.user_dependencies import get_user_commands
from domain.aggregates.user_aggregate import UserAggregate

# Initialize JWT helper (singleton for performance)
jwt_helper = JWTHelper()

async def get_current_user_from_token(
    request: Request,
    commands = Depends(get_user_commands)
) -> UserAggregate:
    """
    FastAPI dependency to get current authenticated user from JWT token.
    
    This dependency:
    1. Extracts JWT token from auth_token cookie
    2. Verifies token and extracts email
    3. Gets or creates user using email
    4. Returns authenticated user aggregate
    
    Args:
        request: FastAPI Request object for cookie access
        commands: Injected user commands
        
    Returns:
        UserAggregate: Authenticated user
        
    Raises:
        HTTPException: If authentication fails
    """
    # Extract token from cookie
    token = jwt_helper.get_token_from_cookie(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required - no auth token found"
        )
    
    # Verify token and get email
    email = jwt_helper.verify_auth_token(token)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token"
        )
    
    try:
        # Get or create user using authenticated email
        get_or_create_cmd = commands['get_or_create']
        user = get_or_create_cmd.execute(email)
        
        return user
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication error during user retrieval"
        )

async def get_optional_user_from_token(
    request: Request,
    commands = Depends(get_user_commands)
) -> Optional[UserAggregate]:
    """
    FastAPI dependency to optionally get current user from JWT token.
    
    Similar to get_current_user_from_token but returns None instead of
    raising HTTP exceptions when authentication fails. Useful for
    endpoints that work with or without authentication.
    
    Args:
        request: FastAPI Request object for cookie access
        commands: Injected user commands
        
    Returns:
        UserAggregate: Authenticated user if valid token, None otherwise
    """
    try:
        # Extract token from cookie
        token = jwt_helper.get_token_from_cookie(request)
        if not token:
            return None
        
        # Verify token and get email
        email = jwt_helper.verify_auth_token(token)
        if not email:
            return None
        
        # Get or create user using authenticated email
        get_or_create_cmd = commands['get_or_create']
        user = get_or_create_cmd.execute(email)
        
        return user
        
    except Exception:
        # Silently fail for optional authentication
        return None

def verify_user_access(current_user: UserAggregate, target_user_id: str) -> bool:
    """
    Helper function to verify user has access to target user data.
    
    Used in endpoints where users should only access their own data.
    
    Args:
        current_user: Currently authenticated user
        target_user_id: User ID being accessed
        
    Returns:
        bool: True if access is allowed
    """
    return str(current_user.id) == target_user_id