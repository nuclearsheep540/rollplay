# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import APIRouter, Depends, HTTPException, status, Request
from typing import Dict, Optional

from user.schemas.user_schemas import (
    UserCreateRequest, 
    UserResponse, 
    UserLoginRequest, 
    UserLoginResponse
)
from pydantic import BaseModel
from user.dependencies.repositories import get_user_repository
from campaign.dependencies.repositories import get_campaign_repository

from user.adapters.repositories import UserRepository
from campaign.adapters.repositories import CampaignRepository
from user.application.commands import GetOrCreateUser, UpdateUserLogin, UpdateScreenName, GetUserDashboard
from shared.dependencies.auth import get_current_user_from_token
from user.domain.aggregates import UserAggregate

class ScreenNameUpdateRequest(BaseModel):
    screen_name: str

router = APIRouter()


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
            screen_name=user.screen_name,
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

@router.get("/test")
async def test_endpoint():
    """Test endpoint to verify container is working"""
    print("🔍 TEST: Test endpoint called!")
    return {"message": "Test endpoint working", "timestamp": "now"}

@router.get("/", response_model=UserResponse)
async def get_current_user(
    current_user: UserAggregate = Depends(get_current_user_from_token)
):
    """
    Get current user info from JWT token.
    """
    print("🔍 DEBUG: Inside get_current_user endpoint")
    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        screen_name=current_user.screen_name,
        created_at=current_user.created_at,
        last_login=current_user.last_login,
        is_recently_active=current_user.is_recently_active()
    )

@router.put("/screen-name", response_model=UserResponse)
async def update_screen_name(
    request: ScreenNameUpdateRequest,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    user_repo: UserRepository = Depends(get_user_repository)
):
    """
    Update user screen name.
    
    Allows authenticated users to set or update their screen name.
    Screen name must be 1-30 characters and cannot be empty.
    """
    try:
        command = UpdateScreenName(user_repo)
        updated_user = command.execute(str(current_user.id), request.screen_name)
        
        return UserResponse(
            id=str(updated_user.id),
            email=updated_user.email,
            screen_name=updated_user.screen_name,
            created_at=updated_user.created_at,
            last_login=updated_user.last_login,
            is_recently_active=updated_user.is_recently_active()
        )
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid screen name: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during screen name update"
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
            screen_name=user.screen_name,
            created_at=user.created_at,
            last_login=user.last_login,
            is_recently_active=user.is_recently_active()
        )
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid request: {str(e)}"
        )


@router.get("/dashboard")
async def get_user_dashboard(
    current_user: UserAggregate = Depends(get_current_user_from_token),
    user_repo: UserRepository = Depends(get_user_repository),
    campaign_repo: CampaignRepository = Depends(get_campaign_repository)
):
    """
    Get user dashboard data demonstrating cross-aggregate coordination.
    
    This endpoint shows how to orchestrate multiple aggregates:
    - User aggregate (for user data)
    - Campaign aggregate (for campaign/game data)
    """
    try:
        command = GetUserDashboard(user_repo, campaign_repo)
        dashboard_data = command.execute(str(current_user.id))
        
        return {
            "user": {
                "id": str(dashboard_data['user'].id),
                "email": dashboard_data['user'].email,
                "screen_name": dashboard_data['user'].screen_name,
                "created_at": dashboard_data['user'].created_at,
                "last_login": dashboard_data['user'].last_login,
                "is_recently_active": dashboard_data['user'].is_recently_active()
            },
            "campaigns_summary": [
                {
                    "id": str(campaign.id),
                    "name": campaign.name,
                    "total_games": campaign.get_total_games(),
                    "active_games": len(campaign.get_active_games())
                }
                for campaign in dashboard_data['campaigns']
            ],
            "metrics": dashboard_data['metrics']
        }
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Dashboard error: {str(e)}"
        )