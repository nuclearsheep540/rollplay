# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from uuid import UUID
import logging
from fastapi import APIRouter, Depends, HTTPException, status

from modules.friendship.schemas.friendship_schemas import (
    SendFriendRequestRequest,
    FriendRequestResponse,
    FriendshipResponse,
    CategorizedFriendListResponse
)
from modules.friendship.application.commands import (
    SendFriendRequest,
    AcceptFriendRequest,
    DeclineFriendRequest,
    RemoveFriend
)
from modules.friendship.application.queries import (
    GetAllUserFriendships
)
from modules.friendship.dependencies.repositories import (
    get_friendship_repository,
    get_friend_request_repository
)
from modules.friendship.repositories.friendship_repository import FriendshipRepository
from modules.friendship.repositories.friend_request_repository import FriendRequestRepository
from modules.user.orm.user_repository import UserRepository
from modules.user.dependencies.providers import user_repository as get_user_repository
from modules.user.domain.user_aggregate import UserAggregate
from shared.dependencies.auth import get_current_user_from_token

logger = logging.getLogger(__name__)

router = APIRouter(tags=["friendships"])


def _to_friendship_response(
    friendship,
    current_user_id: UUID,
    user_repo: UserRepository
) -> FriendshipResponse:
    """
    Convert FriendshipAggregate to FriendshipResponse.

    Computes the "other user" as friend_id and looks up their screen name.
    """
    # Determine which user is the "friend" (the other user)
    friend_user_id = friendship.get_other_user(current_user_id)

    # Look up friend's details
    friend_user = user_repo.get_by_id(friend_user_id)

    return FriendshipResponse(
        id=friendship.id,
        friend_id=friend_user_id,
        friend_screen_name=friend_user.screen_name if friend_user else None,
        created_at=friendship.created_at
    )


def _to_friend_request_response(
    friend_request,
    current_user_id: UUID,
    user_repo: UserRepository
) -> FriendRequestResponse:
    """
    Convert FriendRequestAggregate to FriendRequestResponse.

    Populates the appropriate screen_name field based on direction:
    - Incoming requests: populate requester_screen_name
    - Outgoing requests: populate recipient_screen_name
    """
    requester = user_repo.get_by_id(friend_request.requester_id)
    recipient = user_repo.get_by_id(friend_request.recipient_id)

    return FriendRequestResponse(
        id=friend_request.id,
        requester_id=friend_request.requester_id,
        recipient_id=friend_request.recipient_id,
        requester_screen_name=requester.screen_name if requester else None,
        recipient_screen_name=recipient.screen_name if recipient else None,
        created_at=friend_request.created_at
    )


@router.post("/request", response_model=FriendshipResponse, status_code=status.HTTP_201_CREATED)
async def send_friend_request(
    request: SendFriendRequestRequest,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    friendship_repo: FriendshipRepository = Depends(get_friendship_repository),
    friend_request_repo: FriendRequestRepository = Depends(get_friend_request_repository),
    user_repo: UserRepository = Depends(get_user_repository)
):
    """
    Send a friend request by UUID.

    If a reverse request exists (mutual interest), both users become friends instantly.
    """
    try:
        command = SendFriendRequest(friendship_repo, friend_request_repo, user_repo)
        result = command.execute(
            user_id=current_user.id,
            friend_uuid=request.friend_uuid
        )

        # Check if auto-accepted (mutual request)
        if result['auto_accepted']:
            # Return friendship response
            friendship = result['data']
            return _to_friendship_response(friendship, current_user.id, user_repo)
        else:
            # Return friend request as friendship response (for backward compatibility)
            # The request was sent successfully
            friend_request = result['data']
            return FriendshipResponse(
                id=friend_request.id,
                friend_id=friend_request.recipient_id,
                friend_screen_name=user_repo.get_by_id(friend_request.recipient_id).screen_name,
                created_at=friend_request.created_at
            )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{friend_id}/accept", response_model=FriendshipResponse)
async def accept_friend_request(
    friend_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    friendship_repo: FriendshipRepository = Depends(get_friendship_repository),
    friend_request_repo: FriendRequestRepository = Depends(get_friend_request_repository),
    user_repo: UserRepository = Depends(get_user_repository)
):
    """Accept an incoming friend request"""
    try:
        command = AcceptFriendRequest(friendship_repo, friend_request_repo)
        friendship = command.execute(
            user_id=current_user.id,
            requester_id=friend_id
        )
        return _to_friendship_response(friendship, current_user.id, user_repo)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{friend_id}/decline", status_code=status.HTTP_204_NO_CONTENT)
async def decline_friend_request(
    friend_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    friend_request_repo: FriendRequestRepository = Depends(get_friend_request_repository)
):
    """Decline an incoming friend request"""
    try:
        command = DeclineFriendRequest(friend_request_repo)
        success = command.execute(
            user_id=current_user.id,
            requester_id=friend_id
        )
        if not success:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Friend request not found")
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{friend_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_friend(
    friend_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    friendship_repo: FriendshipRepository = Depends(get_friendship_repository)
):
    """Remove a friend (unfriend)"""
    try:
        command = RemoveFriend(friendship_repo)
        success = command.execute(
            user_id=current_user.id,
            friend_id=friend_id
        )
        if not success:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Friendship not found")
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/", response_model=CategorizedFriendListResponse)
async def get_friends(
    current_user: UserAggregate = Depends(get_current_user_from_token),
    friendship_repo: FriendshipRepository = Depends(get_friendship_repository),
    friend_request_repo: FriendRequestRepository = Depends(get_friend_request_repository),
    user_repo: UserRepository = Depends(get_user_repository)
):
    """Get all friendships and friend requests categorized by type"""
    query = GetAllUserFriendships(friendship_repo, friend_request_repo)
    categorized = query.execute(current_user.id)

    return CategorizedFriendListResponse(
        accepted=[
            _to_friendship_response(friendship, current_user.id, user_repo)
            for friendship in categorized['accepted']
        ],
        incoming_requests=[
            _to_friend_request_response(request, current_user.id, user_repo)
            for request in categorized['incoming_requests']
        ],
        outgoing_requests=[
            _to_friend_request_response(request, current_user.id, user_repo)
            for request in categorized['outgoing_requests']
        ],
        total_accepted=len(categorized['accepted']),
        total_incoming=len(categorized['incoming_requests']),
        total_outgoing=len(categorized['outgoing_requests'])
    )
