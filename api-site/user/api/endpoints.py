# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict

from user.schemas.user_schemas import (
    UserCreateRequest, 
    UserResponse, 
    UserLoginRequest, 
    UserLoginResponse
)
from user.dependencies.repositories import get_user_repository
from user.adapters.repositories import UserRepository
from user.application.commands import GetOrCreateUser, UpdateUserLogin
# Note: GetUserDashboard temporarily disabled to avoid circular imports

router = APIRouter(prefix="/users", tags=["users"])

@router.post("/login", response_model=UserLoginResponse)
async def login_user(
    request: UserLoginRequest,
    user_repo: UserRepository = Depends(get_user_repository)
):
    """
    Login or create user by email.
    
    This endpoint implements the get-or-create pattern:
    - If user exists, updates last login and returns user
    - If user doesn't exist, creates new user and returns it
    
    Args:
        request: Login request with email
        user_repo: Injected user repository
        
    Returns:
        UserLoginResponse: User data with creation flag
        
    Raises:
        HTTPException: If email is invalid or database error occurs
    """
    try:
        command = GetOrCreateUser(user_repo)
        user, created = command.execute(request.email)
        
        # Convert domain aggregate to response schema
        user_response = UserResponse(
            id=str(user.id),
            email=user.email,
            created_at=user.created_at,
            last_login=user.last_login,
            is_recently_active=user.is_recently_active()
        )
        
        return UserLoginResponse(
            user=user_response,
            message="User logged in successfully" if not created else "User created and logged in",
            created=created
        )
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid request: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during user login"
        )

@router.post("/create", response_model=UserResponse)
async def create_user(
    request: UserCreateRequest,
    user_repo: UserRepository = Depends(get_user_repository)
):
    """
    Create a new user.
    
    Args:
        request: User creation request
        user_repo: Injected user repository
        
    Returns:
        UserResponse: Created user data
    """
    try:
        command = GetOrCreateUser(user_repo)
        user, created = command.execute(request.email)
        
        return UserResponse(
            id=str(user.id),
            email=user.email,
            created_at=user.created_at,
            last_login=user.last_login,
            is_recently_active=user.is_recently_active()
        )
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid request: {str(e)}"
        )


# Dashboard endpoint temporarily disabled to avoid circular imports during cleanup
# Will be re-enabled after campaign module cleanup is complete
# 
# @router.get("/dashboard")
# async def get_user_dashboard(
#     user_repo: UserRepository = Depends(get_user_repository),
#     campaign_repo: CampaignRepository = Depends(get_campaign_repository)
# ):
#     """Cross-aggregate coordination example - temporarily disabled"""
#     pass