# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from uuid import UUID

from shared.dependencies.auth import get_current_user_from_token
from .schemas import (
    UserEmailRequest,
    UserResponse,
    UserLoginResponse,
    PublicUserResponse
)
from modules.user.dependencies.providers import user_repository
from modules.user.orm.user_repository import UserRepository
from modules.user.application.commands import GetOrCreateUser, UpdateScreenName
from modules.user.application.queries import GetUserDashboard
from modules.user.domain.user_aggregate import UserAggregate
from modules.campaign.dependencies.providers import campaign_repository
from modules.campaign.orm.campaign_repository import CampaignRepository


class ScreenNameUpdateRequest(BaseModel):
    screen_name: str


router = APIRouter()


def _to_user_response(user: UserAggregate) -> UserResponse:
    """Helper to convert UserAggregate to UserResponse"""
    return UserResponse(
        id=str(user.id),
        email=user.email,
        screen_name=user.screen_name,
        friend_code=user.friend_code,
        created_at=user.created_at,
        last_login=user.last_login,
    )


@router.post("/login", response_model=UserLoginResponse)
async def login_user(
    request: UserEmailRequest,
    user_repo: UserRepository = Depends(user_repository)
):
    """
    Login or create user by email.

    This endpoint implements the get-or-create pattern:
    - If user exists, updates last login and returns user
    - If user doesn't exist, creates new user and returns it
    """
    try:
        command = GetOrCreateUser(user_repo)
        user, created = command.execute(request.email)

        return UserLoginResponse(
            user=_to_user_response(user),
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
    return {"message": "Test endpoint working", "timestamp": "now"}


@router.get("/get_current_user", response_model=UserResponse)
async def get_current_user(
    current_user: UserAggregate = Depends(get_current_user_from_token)
):
    """Get current user info from JWT token."""
    return _to_user_response(current_user)


@router.get("/{user_uuid}", response_model=PublicUserResponse)
async def get_user_by_uuid(
    user_uuid: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    user_repo: UserRepository = Depends(user_repository)
):
    """
    Get public user info by UUID (for friend lookups).

    Returns limited public user information without email or sensitive data.
    Requires authentication to prevent abuse.
    """
    user = user_repo.get_by_id(user_uuid)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Return only public information
    return PublicUserResponse(
        id=str(user.id),
        screen_name=user.screen_name,
        friend_code=user.friend_code,
        created_at=user.created_at
    )


@router.get("/by-friend-code/{friend_code}", response_model=PublicUserResponse)
async def get_user_by_friend_code(
    friend_code: str,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    user_repo: UserRepository = Depends(user_repository)
):
    """
    Get public user info by friend code (case-insensitive).

    Returns limited public user information without email or sensitive data.
    Requires authentication to prevent abuse.
    Friend code format: ABCD-1234 (8 characters: 4 letters + dash + 4 numbers)
    """
    user = user_repo.get_by_friend_code(friend_code)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Friend code not found"
        )

    # Return only public information
    return PublicUserResponse(
        id=str(user.id),
        screen_name=user.screen_name,
        friend_code=user.friend_code,
        created_at=user.created_at
    )


@router.put("/screen_name", response_model=UserResponse)
async def update_screen_name(
    request: ScreenNameUpdateRequest,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    user_repo: UserRepository = Depends(user_repository)
):
    """
    Update user screen name.

    Allows authenticated users to set or update their screen name.
    Screen name must be 1-30 characters and cannot be empty.
    """
    try:
        command = UpdateScreenName(user_repo)
        updated_user = command.execute(str(current_user.id), request.screen_name)

        return _to_user_response(updated_user)

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
    request: UserEmailRequest,
    user_repo: UserRepository = Depends(user_repository)
):
    """Create a new user."""
    try:
        command = GetOrCreateUser(user_repo)
        created_user = command.execute(request.email)

        return _to_user_response(created_user)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid request: {str(e)}"
        )


@router.get("/dashboard")
async def get_user_dashboard(
    current_user: UserAggregate = Depends(get_current_user_from_token),
    user_repo: UserRepository = Depends(user_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository)
):
    """
    Get user dashboard data demonstrating cross-aggregate coordination.

    This endpoint shows how to orchestrate multiple aggregates:
    - User aggregate (for user data)
    - Campaign aggregate (for campaign/game data)
    """
    try:
        query = GetUserDashboard(user_repo, campaign_repo)
        dashboard_data = query.execute(str(current_user.id))

        return {
            "user": {
                "id": str(dashboard_data['user'].id),
                "email": dashboard_data['user'].email,
                "screen_name": dashboard_data['user'].screen_name,
                "created_at": dashboard_data['user'].created_at,
                "last_login": dashboard_data['user'].last_login,
            },
            "campaigns_summary": [
                {
                    "id": str(campaign.id),
                    "name": campaign.name,
                    "total_games": campaign.get_total_games(),
                    "active_games": 0  # TODO: Query game module for active game count
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
