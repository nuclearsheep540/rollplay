# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import logging
from fastapi import Depends, HTTPException, Request, status

from shared.jwt_helper import JWTHelper
from modules.user.dependencies.providers import user_repository
from modules.user.orm.user_repository import UserRepository
from modules.campaign.dependencies.providers import campaign_repository
from modules.campaign.orm.campaign_repository import CampaignRepository
from modules.user.application.commands import GetOrCreateUser
from modules.user.domain.user_aggregate import UserAggregate

logger = logging.getLogger(__name__)

# Initialize JWT helper (singleton for performance)
jwt_helper = JWTHelper()

async def get_current_user_from_token(
    request: Request,
    user_repo: UserRepository = Depends(user_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository)
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

    # Verify token and get email
    email = jwt_helper.verify_auth_token(token)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token"
        )

    try:
        logger.debug(f"Creating GetOrCreateUser command for email: {email}")
        # Get or create user using authenticated email via DDD pattern
        # Campaign repository is passed to create demo campaign for new users
        command = GetOrCreateUser(user_repo, campaign_repo)
        logger.debug("Executing GetOrCreateUser command")
        user, created = command.execute(email)
        logger.debug(f"User command executed successfully. Created: {created}")
        return user

    except Exception as e:
        logger.debug(f"Exception in user retrieval: {type(e).__name__}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Authentication error during user retrieval: {str(e)}"
        )