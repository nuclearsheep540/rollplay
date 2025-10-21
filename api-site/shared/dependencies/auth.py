# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import Depends, HTTPException, Request, status

from shared.jwt_helper import JWTHelper
from modules.user.dependencies.providers import user_repository
from modules.user.orm.user_repository import UserRepository
from modules.user.application.commands import GetOrCreateUser
from modules.user.domain.user_aggregate import UserAggregate

# Initialize JWT helper (singleton for performance)
jwt_helper = JWTHelper()

async def get_current_user_from_token(
    request: Request,
    user_repo: UserRepository = Depends(user_repository)
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
    # Debug: Log authentication attempt with print to ensure visibility
    print("🔍 DEBUG: get_current_user_from_token called")
    
    try:
        # Extract token from cookie
        token = jwt_helper.get_token_from_cookie(request)
        print(f"🔍 DEBUG: Token extracted: {token[:50] if token else 'None'}...")
        
        if not token:
            print("🔍 DEBUG: No auth token found in request")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required - no auth token found"
            )
    except Exception as e:
        print(f"🔍 DEBUG: Exception in token extraction: {e}")
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
        print(f"🔍 DEBUG: Creating GetOrCreateUser command for email: {email}")
        # Get or create user using authenticated email via new DDD pattern
        command = GetOrCreateUser(user_repo)
        print("🔍 DEBUG: Executing GetOrCreateUser command")
        user, created = command.execute(email)
        print(f"🔍 DEBUG: User command executed successfully. Created: {created}")
        
        return user
        
    except Exception as e:
        print(f"🔍 DEBUG: Exception in user retrieval: {type(e).__name__}: {str(e)}")
        import traceback
        print(f"🔍 DEBUG: Full traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Authentication error during user retrieval: {str(e)}"
        )