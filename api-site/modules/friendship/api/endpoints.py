# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from uuid import UUID
import logging
from fastapi import APIRouter, Depends, HTTPException, status

from modules.friendship.schemas.friendship_schemas import (
    SendFriendRequestRequest,
    FriendshipResponse,
    FriendListResponse
)
from modules.friendship.application.commands import (
    SendFriendRequest,
    AcceptFriendRequest,
    DeclineFriendRequest,
    RemoveFriend
)
from modules.friendship.application.queries import (
    GetUserFriends,
    GetPendingFriendRequests,
    GetSentFriendRequests
)
from modules.friendship.dependencies.repositories import get_friendship_repository
from modules.friendship.repositories.friendship_repository import FriendshipRepository
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
    Convert FriendshipAggregate to FriendshipResponse with friend details populated.

    Args:
        friendship: FriendshipAggregate
        current_user_id: UUID of the current user
        user_repo: UserRepository for looking up friend details
    """
    # Determine which user is the "friend" (the other user)
    friend_user_id = friendship.get_other_user(current_user_id)

    # Look up friend's details
    friend_user = user_repo.get_by_id(friend_user_id)

    return FriendshipResponse(
        user_id=friendship.user_id,
        friend_id=friendship.friend_id,
        status=friendship.status.value,
        created_at=friendship.created_at,
        friend_screen_name=friend_user.screen_name if friend_user else None,
        friend_email=friend_user.email if friend_user else None
    )


@router.post("/request", response_model=FriendshipResponse, status_code=status.HTTP_201_CREATED)
async def send_friend_request(
    request: SendFriendRequestRequest,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    friendship_repo: FriendshipRepository = Depends(get_friendship_repository),
    user_repo: UserRepository = Depends(get_user_repository)
):
    """Send a friend request by UUID"""
    try:
        command = SendFriendRequest(friendship_repo, user_repo)
        friendship = command.execute(
            user_id=current_user.id,
            friend_uuid=request.friend_uuid
        )
        return _to_friendship_response(friendship, current_user.id, user_repo)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{friend_id}/accept", response_model=FriendshipResponse)
async def accept_friend_request(
    friend_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    friendship_repo: FriendshipRepository = Depends(get_friendship_repository),
    user_repo: UserRepository = Depends(get_user_repository)
):
    """Accept an incoming friend request"""
    try:
        command = AcceptFriendRequest(friendship_repo)
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
    friendship_repo: FriendshipRepository = Depends(get_friendship_repository)
):
    """Decline an incoming friend request"""
    try:
        command = DeclineFriendRequest(friendship_repo)
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


@router.get("/", response_model=FriendListResponse)
async def get_friends(
    current_user: UserAggregate = Depends(get_current_user_from_token),
    friendship_repo: FriendshipRepository = Depends(get_friendship_repository),
    user_repo: UserRepository = Depends(get_user_repository)
):
    """Get all accepted friends"""
    query = GetUserFriends(friendship_repo)
    friendships = query.execute(current_user.id)

    return FriendListResponse(
        friendships=[_to_friendship_response(f, current_user.id, user_repo) for f in friendships],
        total=len(friendships)
    )


@router.get("/requests/incoming", response_model=FriendListResponse)
async def get_incoming_requests(
    current_user: UserAggregate = Depends(get_current_user_from_token),
    friendship_repo: FriendshipRepository = Depends(get_friendship_repository),
    user_repo: UserRepository = Depends(get_user_repository)
):
    """Get all incoming pending friend requests"""
    query = GetPendingFriendRequests(friendship_repo)
    friendships = query.execute(current_user.id)

    return FriendListResponse(
        friendships=[_to_friendship_response(f, current_user.id, user_repo) for f in friendships],
        total=len(friendships)
    )


@router.get("/requests/outgoing", response_model=FriendListResponse)
async def get_outgoing_requests(
    current_user: UserAggregate = Depends(get_current_user_from_token),
    friendship_repo: FriendshipRepository = Depends(get_friendship_repository),
    user_repo: UserRepository = Depends(get_user_repository)
):
    """Get all outgoing pending friend requests"""
    query = GetSentFriendRequests(friendship_repo)
    friendships = query.execute(current_user.id)

    return FriendListResponse(
        friendships=[_to_friendship_response(f, current_user.id, user_repo) for f in friendships],
        total=len(friendships)
    )
