# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from uuid import UUID
import logging
import time
from fastapi import APIRouter, Depends, HTTPException, status

from .schemas import (
    SendFriendRequestRequest,
    FriendRequestResponse,
    FriendshipResponse,
    CategorizedFriendListResponse
)
from modules.friendship.application.commands import (
    SendFriendRequest,
    AcceptFriendRequest,
    DeclineFriendRequest,
    RemoveFriend,
    BuzzFriend
)
from modules.friendship.application.queries import (
    GetAllUserFriendships
)
from modules.friendship.dependencies.providers import (
    get_friendship_repository,
    get_friend_request_repository
)
from modules.friendship.repositories.friendship_repository import FriendshipRepository
from modules.friendship.repositories.friend_request_repository import FriendRequestRepository
from modules.user.repositories.user_repository import UserRepository
from modules.user.dependencies.providers import user_repository as get_user_repository
from modules.events.event_manager import EventManager
from modules.events.dependencies.providers import get_event_manager
from modules.events.websocket_manager import event_connection_manager
from shared.dependencies.auth import get_current_user_id

logger = logging.getLogger(__name__)

router = APIRouter(tags=["friendships"])


def _to_friendship_response(
    friendship,
    current_user_id: UUID,
    user_repo: UserRepository
) -> FriendshipResponse:
    """
    Convert FriendshipAggregate to FriendshipResponse.

    Computes the "other user" as friend_id and looks up their screen name, account tag,
    and online status from the events WebSocket connection manager.
    """
    # Determine which user is the "friend" (the other user)
    friend_user_id = friendship.get_other_user(current_user_id)

    # Look up friend's details
    friend_user = user_repo.get_by_id(friend_user_id)

    # Check if friend is currently connected to events WebSocket
    is_online = event_connection_manager.is_user_connected(str(friend_user_id))

    return FriendshipResponse(
        id=friendship.id,
        friend_id=friend_user_id,
        friend_screen_name=friend_user.screen_name if friend_user else None,
        friend_account_tag=friend_user.account_identifier if friend_user else None,
        is_online=is_online,
        created_at=friendship.created_at
    )


def _to_friend_request_response(
    friend_request,
    current_user_id: UUID,
    user_repo: UserRepository
) -> FriendRequestResponse:
    """
    Convert FriendRequestAggregate to FriendRequestResponse.

    Populates the appropriate screen_name and account_tag fields based on direction:
    - Incoming requests: populate requester_screen_name and requester_account_tag
    - Outgoing requests: populate recipient_screen_name and recipient_account_tag
    """
    requester = user_repo.get_by_id(friend_request.requester_id)
    recipient = user_repo.get_by_id(friend_request.recipient_id)

    return FriendRequestResponse(
        id=friend_request.id,
        requester_id=friend_request.requester_id,
        recipient_id=friend_request.recipient_id,
        requester_screen_name=requester.screen_name if requester else None,
        requester_account_tag=requester.account_identifier if requester else None,
        recipient_screen_name=recipient.screen_name if recipient else None,
        recipient_account_tag=recipient.account_identifier if recipient else None,
        created_at=friend_request.created_at
    )


@router.post("/request", response_model=FriendshipResponse, status_code=status.HTTP_201_CREATED)
async def send_friend_request(
    request: SendFriendRequestRequest,
    user_id: UUID = Depends(get_current_user_id),
    friendship_repo: FriendshipRepository = Depends(get_friendship_repository),
    friend_request_repo: FriendRequestRepository = Depends(get_friend_request_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    event_manager: EventManager = Depends(get_event_manager)
):
    """
    Send a friend request by UUID.

    If a reverse request exists (mutual interest), both users become friends instantly.
    """
    try:
        command = SendFriendRequest(friendship_repo, friend_request_repo, user_repo, event_manager)
        result = await command.execute(
            user_id=user_id,
            friend_identifier=request.friend_identifier
        )

        # Check if auto-accepted (mutual request)
        if result['auto_accepted']:
            # Return friendship response
            friendship = result['data']
            return _to_friendship_response(friendship, user_id, user_repo)
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
    user_id: UUID = Depends(get_current_user_id),
    friendship_repo: FriendshipRepository = Depends(get_friendship_repository),
    friend_request_repo: FriendRequestRepository = Depends(get_friend_request_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    event_manager: EventManager = Depends(get_event_manager)
):
    """Accept an incoming friend request"""
    try:
        command = AcceptFriendRequest(friendship_repo, friend_request_repo, user_repo, event_manager)
        friendship = await command.execute(
            user_id=user_id,
            requester_id=friend_id
        )
        return _to_friendship_response(friendship, user_id, user_repo)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{friend_id}/decline", status_code=status.HTTP_204_NO_CONTENT)
async def decline_friend_request(
    friend_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    friend_request_repo: FriendRequestRepository = Depends(get_friend_request_repository)
):
    """Decline an incoming friend request"""
    try:
        command = DeclineFriendRequest(friend_request_repo)
        success = command.execute(
            user_id=user_id,
            requester_id=friend_id
        )
        if not success:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Friend request not found")
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{friend_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_friend(
    friend_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    friendship_repo: FriendshipRepository = Depends(get_friendship_repository)
):
    """Remove a friend (unfriend)"""
    try:
        command = RemoveFriend(friendship_repo)
        success = command.execute(
            user_id=user_id,
            friend_id=friend_id
        )
        if not success:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Friendship not found")
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/", response_model=CategorizedFriendListResponse)
async def get_friends(
    user_id: UUID = Depends(get_current_user_id),
    friendship_repo: FriendshipRepository = Depends(get_friendship_repository),
    friend_request_repo: FriendRequestRepository = Depends(get_friend_request_repository),
    user_repo: UserRepository = Depends(get_user_repository)
):
    """Get all friendships and friend requests categorized by type"""
    query = GetAllUserFriendships(friendship_repo, friend_request_repo)
    categorized = query.execute(user_id)

    return CategorizedFriendListResponse(
        accepted=[
            _to_friendship_response(friendship, user_id, user_repo)
            for friendship in categorized['accepted']
        ],
        incoming_requests=[
            _to_friend_request_response(request, user_id, user_repo)
            for request in categorized['incoming_requests']
        ],
        outgoing_requests=[
            _to_friend_request_response(request, user_id, user_repo)
            for request in categorized['outgoing_requests']
        ],
        total_accepted=len(categorized['accepted']),
        total_incoming=len(categorized['incoming_requests']),
        total_outgoing=len(categorized['outgoing_requests'])
    )


# In-memory rate limit storage for buzz feature
# Key: "sender_id:recipient_id" -> timestamp of last buzz
_buzz_rate_limits = {}  # Dict[str, float]
BUZZ_COOLDOWN_SECONDS = 20


@router.post("/{friend_id}/buzz", status_code=status.HTTP_204_NO_CONTENT)
async def buzz_friend(
    friend_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    friendship_repo: FriendshipRepository = Depends(get_friendship_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    event_manager: EventManager = Depends(get_event_manager)
):
    """
    Send a buzz notification to a friend.

    Rate limited to once every 20 seconds per sender-recipient pair.
    """
    command = BuzzFriend(friendship_repo, user_repo, event_manager, _buzz_rate_limits, BUZZ_COOLDOWN_SECONDS)
    try:
        await command.execute(
            user_id=user_id,
            friend_id=friend_id
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
