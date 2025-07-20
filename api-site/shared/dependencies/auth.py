# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import Depends, HTTPException, Request, status
from typing import Optional

from shared.auth import JWTHelper
from user.dependencies.repositories import get_user_repository
from user.adapters.repositories import UserRepository
from user.application.commands import GetOrCreateUser
from user.domain.aggregates import UserAggregate

# Initialize JWT helper (singleton for performance)
jwt_helper = JWTHelper()

async def get_current_user_from_token(
    request: Request,
    user_repo: UserRepository = Depends(get_user_repository)
) -> UserAggregate:
    """
    FastAPI dependency to get current authenticated user from JWT token.
    
    Token decoding, user resolution, session lifecycle management.
    
    Args:
        request: FastAPI Request object for cookie access
        user_repo: Injected user repository
        
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
        # Get or create user using authenticated email via new DDD pattern
        command = GetOrCreateUser(user_repo)
        user, created = command.execute(email)
        
        return user
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication error during user retrieval"
        )