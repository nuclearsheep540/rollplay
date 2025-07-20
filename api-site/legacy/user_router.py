# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict

from api.schemas.user_schemas import (
    UserCreateRequest, 
    UserResponse, 
    UserLoginRequest, 
    UserLoginResponse
)
from dependencies.repositories import get_user_repository
from campaign.dependencies.repositories import get_campaign_repository
from adapters.repositories.user_repository import UserRepository
from campaign.adapters.repositories import CampaignRepository
from application.commands.user_commands import GetOrCreateUser, UpdateUserLogin, GetUserDashboard

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


@router.get("/dashboard")
async def get_user_dashboard(
    user_repo: UserRepository = Depends(get_user_repository),
    campaign_repo: CampaignRepository = Depends(get_campaign_repository)
):
    """
    Get user dashboard data demonstrating cross-aggregate coordination.
    
    This endpoint shows how to orchestrate multiple aggregates:
    - User aggregate (for user data)
    - Campaign aggregate (for campaign/game data)
    
    Args:
        user_repo: Injected user repository
        campaign_repo: Injected campaign repository
        
    Returns:
        Dashboard data with user info and campaign metrics
    """
    try:
        # For demo purposes, use a hardcoded user ID
        # In real app, this would come from authentication
        demo_user_id = "550e8400-e29b-41d4-a716-446655440000"  # UUID format
        
        command = GetUserDashboard(user_repo, campaign_repo)
        dashboard_data = command.execute(demo_user_id)
        
        return {
            "user": {
                "id": str(dashboard_data['user'].id),
                "email": dashboard_data['user'].email,
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