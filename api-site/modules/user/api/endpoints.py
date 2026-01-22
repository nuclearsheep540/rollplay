# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from pydantic import BaseModel
from uuid import UUID

from shared.dependencies.auth import get_current_user_from_token, get_current_user_id
from shared.jwt_helper import JWTHelper
from .schemas import (
    UserEmailRequest,
    UserResponse,
    UserLoginResponse,
    PublicUserResponse,
    SetAccountNameRequest,
    AccountNameResponse,
    InternalUserResolveResponse
)
from modules.user.dependencies.providers import user_repository
from modules.user.orm.user_repository import UserRepository
from modules.user.application.commands import GetOrCreateUser, UpdateScreenName, SoftDeleteUser, HardDeleteUser
from modules.user.application.queries import GetUserDashboard
from modules.user.domain.user_aggregate import UserAggregate
from modules.campaign.dependencies.providers import campaign_repository
from modules.campaign.orm.campaign_repository import CampaignRepository


class ScreenNameUpdateRequest(BaseModel):
    screen_name: str


router = APIRouter()

# Initialize JWT helper for refresh token operations
jwt_helper = JWTHelper()


def _to_user_response(user: UserAggregate) -> UserResponse:
    """Helper to convert UserAggregate to UserResponse"""
    return UserResponse(
        id=str(user.id),
        email=user.email,
        screen_name=user.screen_name,
        friend_code=user.friend_code,
        account_name=user.account_name,
        account_tag=user.account_tag,
        account_identifier=user.account_identifier,
        created_at=user.created_at,
        last_login=user.last_login,
    )


def _to_public_user_response(user: UserAggregate) -> PublicUserResponse:
    """Helper to convert UserAggregate to PublicUserResponse"""
    return PublicUserResponse(
        id=str(user.id),
        screen_name=user.screen_name,
        friend_code=user.friend_code,
        account_name=user.account_name,
        account_tag=user.account_tag,
        account_identifier=user.account_identifier,
        created_at=user.created_at
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

    Note: Demo campaigns are created lazily when user first views their campaign list.
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


@router.post("/internal/resolve-user", response_model=InternalUserResolveResponse)
async def resolve_user_for_auth(
    request: UserEmailRequest,
    user_repo: UserRepository = Depends(user_repository)
):
    """
    Internal endpoint for api-auth to resolve user_id from email.

    This is a service-to-service contract. NOT exposed via NGINX.
    Only accessible within Docker network (http://api-site:8082).

    Implements get-or-create pattern:
    - If user exists, returns user_id
    - If user doesn't exist, creates user and returns new user_id

    Returns minimal data needed for JWT token creation.
    """
    try:
        command = GetOrCreateUser(user_repo)
        user, _ = command.execute(request.email)

        return InternalUserResolveResponse(
            user_id=str(user.id),
            email=user.email
        )

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid request: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during user resolution"
        )


@router.post("/auth/refresh")
async def refresh_access_token(
    request: Request,
    response: Response,
    user_repo: UserRepository = Depends(user_repository)
):
    """
    Exchange refresh token for new access token.

    This is the ONLY endpoint that validates refresh tokens.
    Performs DB check to ensure user still exists and is active (not soft-deleted).

    Returns 401 if:
    - No refresh token in cookies
    - Refresh token is invalid or expired
    - User not found or soft-deleted
    """
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token"
        )

    # Validate refresh token
    payload = jwt_helper.verify_refresh_token(refresh_token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )

    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token payload"
        )

    # DB CHECK: Verify user exists and is active (excludes soft-deleted by default)
    user = user_repo.get_by_id(user_id)
    if not user:
        # Clear cookies - user is deleted or doesn't exist
        response.delete_cookie("auth_token", path="/", httponly=True, secure=True, samesite="lax")
        response.delete_cookie("refresh_token", path="/", httponly=True, secure=True, samesite="lax")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    # Issue new access token
    new_access_token = jwt_helper.create_access_token(
        user_id=str(user.id),
        email=user.email
    )

    response.set_cookie(
        key="auth_token",
        value=new_access_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=900,  # 15 minutes
        path="/"
    )

    return {"message": "Token refreshed", "access_token": new_access_token}


@router.get("/get_current_user", response_model=UserResponse)
async def get_current_user(
    current_user: UserAggregate = Depends(get_current_user_from_token)
):
    """Get current user info from JWT token."""
    return _to_user_response(current_user)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_current_user(
    response: Response,
    user_id: UUID = Depends(get_current_user_id),
    user_repo: UserRepository = Depends(user_repository)
):
    """
    Soft delete current user's account.

    This marks the account as deleted but preserves data.
    User can no longer log in but data is retained for recovery if needed.
    Clears the auth cookie to log the user out.
    """
    command = SoftDeleteUser(user_repo)
    deleted = command.execute(user_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Clear auth cookies to log user out
    response.delete_cookie(
        key="auth_token",
        path="/",
        httponly=True,
        secure=True,
        samesite="lax"
    )
    response.delete_cookie(
        key="refresh_token",
        path="/",
        httponly=True,
        secure=True,
        samesite="lax"
    )


@router.delete("/me/hard", status_code=status.HTTP_204_NO_CONTENT)
async def hard_delete_current_user(
    response: Response,
    user_id: UUID = Depends(get_current_user_id),
    user_repo: UserRepository = Depends(user_repository)
):
    """
    DEVELOPMENT ONLY: Hard delete current user's account permanently.

    WARNING: This is irreversible. All user data will be permanently deleted.
    Use DELETE /me for production soft delete.
    Clears the auth cookie to log the user out.
    """
    command = HardDeleteUser(user_repo)
    deleted = command.execute(user_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Clear auth cookies to log user out
    response.delete_cookie(
        key="auth_token",
        path="/",
        httponly=True,
        secure=True,
        samesite="lax"
    )
    response.delete_cookie(
        key="refresh_token",
        path="/",
        httponly=True,
        secure=True,
        samesite="lax"
    )


@router.get("/ws-token")
async def get_websocket_token(request: Request):
    """
    Get JWT token from httpOnly cookie for WebSocket authentication.

    This endpoint extracts the token from the httpOnly cookie and returns it
    so the frontend can use it for WebSocket connection. This is secure because:
    - The httpOnly cookie is still protected from XSS attacks
    - Only authenticated users can call this endpoint
    - The token is only exposed momentarily for WebSocket connection
    """
    jwt_helper = JWTHelper()
    token = jwt_helper.get_token_from_cookie(request)

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No authentication token found"
        )

    # Verify the token is valid before returning it
    email = jwt_helper.verify_auth_token(token)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )

    return {"token": token}


@router.get("/{user_uuid}", response_model=PublicUserResponse)
async def get_user_by_uuid(
    user_uuid: UUID,
    _user_id: UUID = Depends(get_current_user_id),
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

    return _to_public_user_response(user)


@router.get("/by-friend-code/{friend_code}", response_model=PublicUserResponse)
async def get_user_by_friend_code(
    friend_code: str,
    _user_id: UUID = Depends(get_current_user_id),
    user_repo: UserRepository = Depends(user_repository)
):
    """
    Get public user info by friend code (case-insensitive).
    DEPRECATED: Use /by-account-tag/{identifier} instead.

    Returns limited public user information without email or sensitive data.
    Requires authentication to prevent abuse.
    """
    user = user_repo.get_by_friend_code(friend_code)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Friend code not found"
        )

    return _to_public_user_response(user)


@router.get("/by-account-tag/{identifier}", response_model=PublicUserResponse)
async def get_user_by_account_tag(
    identifier: str,
    _user_id: UUID = Depends(get_current_user_id),
    user_repo: UserRepository = Depends(user_repository)
):
    """
    Get public user info by account identifier (e.g., "claude#2345").

    Case-insensitive on account_name, exact match on tag.
    Returns limited public user information without email or sensitive data.
    Requires authentication to prevent abuse.
    """
    if '#' not in identifier:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid account identifier format. Expected format: name#tag (e.g., claude#2345)"
        )

    user = user_repo.get_by_account_identifier(identifier)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )

    return _to_public_user_response(user)


@router.post("/me/account-name", response_model=AccountNameResponse)
async def set_account_name(
    request: SetAccountNameRequest,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    user_repo: UserRepository = Depends(user_repository)
):
    """
    Set user's immutable account name.

    This is a ONE-TIME operation - account name cannot be changed after being set.
    The server will generate a unique 4-digit tag to create the full identifier.

    Validation rules for account_name:
    - 3-30 characters
    - Alphanumeric + dash + underscore only
    - Must start with letter or number

    Returns the full account identifier (e.g., "claude#2345").
    """
    # Check if user already has an account name
    if current_user.account_name is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account name is already set and cannot be changed"
        )

    # Validate format before generating tag
    if not UserAggregate.validate_account_name_format(request.account_name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account name must be 3-30 characters, start with a letter or number, "
                   "and contain only letters, numbers, dashes, and underscores"
        )

    try:
        # Use the pre-assigned tag from user creation
        # No need to generate a new one - it was already assigned deterministically
        if not current_user.account_tag:
            raise ValueError("User does not have a pre-assigned account tag")

        # Set account name on aggregate (validates and uses pre-assigned tag)
        current_user.set_account_name(request.account_name, current_user.account_tag)

        # Persist changes
        user_repo.save(current_user)

        return AccountNameResponse(
            account_name=current_user.account_name,
            account_tag=current_user.account_tag,
            account_identifier=current_user.account_identifier
        )

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate account tag. Please try a different name."
        )


@router.put("/screen_name", response_model=UserResponse)
async def update_screen_name(
    request: ScreenNameUpdateRequest,
    user_id: UUID = Depends(get_current_user_id),
    user_repo: UserRepository = Depends(user_repository)
):
    """
    Update user screen name.

    Allows authenticated users to set or update their screen name.
    Screen name must be 1-30 characters and cannot be empty.
    """
    try:
        command = UpdateScreenName(user_repo)
        updated_user = command.execute(str(user_id), request.screen_name)

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
