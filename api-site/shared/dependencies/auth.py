# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import logging
from uuid import UUID
from fastapi import Depends, HTTPException, Request, status

from shared.jwt_helper import JWTHelper
from modules.user.dependencies.providers import user_repository
from modules.user.repositories.user_repository import UserRepository
from modules.user.domain.user_aggregate import UserAggregate

logger = logging.getLogger(__name__)

# Initialize JWT helper (singleton for performance)
jwt_helper = JWTHelper()


async def get_current_user_id(request: Request) -> UUID:
    """
    Lightweight FastAPI dependency to get current user's ID from JWT token.

    This extracts user_id directly from the JWT without any database lookup.
    Use this for endpoints that only need the user_id (e.g., ownership checks,
    filtering queries by user).

    Performance: ~2-5ms (JWT decode only) vs ~20-50ms (with DB lookup)

    Args:
        request: FastAPI Request object for cookie access

    Returns:
        UUID: The authenticated user's ID

    Raises:
        HTTPException: If authentication fails
    """
    token = jwt_helper.get_token_from_cookie(request)

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required - no auth token found"
        )

    user_id = jwt_helper.extract_user_id_from_token(token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token"
        )

    try:
        return UUID(user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID in token"
        )

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
    logger.debug("get_current_user_from_token called")

    try:
        token = jwt_helper.get_token_from_cookie(request)
        logger.debug(f"Token extracted: {token[:50] if token else 'None'}...")

        if not token:
            logger.debug("No auth token found in request")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required - no auth token found"
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.debug(f"Exception in token extraction: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required - no auth token found"
        )

    # Extract user_id from token (more efficient than email lookup)
    user_id_str = jwt_helper.extract_user_id_from_token(token)
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token"
        )

    # Validate UUID format
    try:
        user_id = UUID(user_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID in token"
        )

    # Read-only lookup - authentication should not have side effects
    # User creation only happens during login flow (api-auth → /internal/resolve-user)
    user = user_repo.get_by_id(user_id)
    if not user:
        # User not found or soft-deleted
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    return user