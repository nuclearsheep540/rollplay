# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from uuid import UUID
import logging
import asyncio

from modules.friendship.repositories.friendship_repository import FriendshipRepository
from modules.friendship.repositories.friend_request_repository import FriendRequestRepository
from modules.user.orm.user_repository import UserRepository
from modules.friendship.domain.friendship_aggregate import FriendshipAggregate
from modules.friendship.domain.friend_request_aggregate import FriendRequestAggregate
from modules.friendship.domain.friendship_events import FriendshipEvents
from modules.events.event_manager import EventManager

logger = logging.getLogger(__name__)


class SendFriendRequest:
    """
    Send a friend request to another user.

    Implements auto-accept for mutual requests:
    - If User A sends request to User B
    - And User B has already sent request to User A
    - Then both requests are deleted and friendship is created instantly
    """

    def __init__(
        self,
        friendship_repository: FriendshipRepository,
        friend_request_repository: FriendRequestRepository,
        user_repository: UserRepository,
        event_manager: EventManager
    ):
        self.friendship_repo = friendship_repository
        self.friend_request_repo = friend_request_repository
        self.user_repo = user_repository
        self.event_manager = event_manager

    def execute(self, user_id: UUID, friend_identifier: str) -> dict:
        """
        Send friend request by friend's UUID or friend code.

        Args:
            user_id: UUID of the requesting user
            friend_identifier: Either a UUID string or friend code (e.g., "ABCD-1234")

        Returns dict with:
        - 'type': 'friendship' or 'friend_request'
        - 'data': FriendshipAggregate or FriendRequestAggregate
        - 'auto_accepted': bool (True if mutual request triggered instant friendship)

        Validation:
        - Both users must exist
        - Cannot friend yourself
        - Cannot send duplicate request
        """
        # Validate requester exists
        user = self.user_repo.get_by_id(user_id)
        if not user:
            raise ValueError(f"User {user_id} not found")

        # Determine if identifier is UUID or friend code and look up friend
        try:
            # Try parsing as UUID first
            friend_uuid = UUID(friend_identifier)
            friend = self.user_repo.get_by_id(friend_uuid)
        except (ValueError, AttributeError):
            # Not a valid UUID, try as friend code
            friend = self.user_repo.get_by_friend_code(friend_identifier)
            if friend:
                friend_uuid = friend.id
            else:
                raise ValueError(f"Friend code '{friend_identifier}' not found")

        if not friend:
            raise ValueError(f"User not found")

        # Check if friendship already exists
        existing_friendship = self.friendship_repo.get_by_canonical_ids(user_id, friend_uuid)
        if existing_friendship:
            raise ValueError("You are already friends with this user")

        # Check if request already exists (A → B)
        existing_request = self.friend_request_repo.get_by_ids(user_id, friend_uuid)
        if existing_request:
            raise ValueError("Friend request already sent")

        # Check for reverse request (B → A) - mutual interest!
        reverse_request = self.friend_request_repo.get_reverse_request(user_id, friend_uuid)
        if reverse_request:
            # AUTO-ACCEPT: Both users want to be friends!
            logger.info(f"Mutual friend request detected: {user_id} ↔ {friend_uuid}. Auto-accepting.")

            # Delete the reverse request
            self.friend_request_repo.delete(friend_uuid, user_id)

            # Create friendship with canonical ordering
            friendship = FriendshipAggregate.create(user_id, friend_uuid)
            self.friendship_repo.save(friendship)

            logger.info(f"Instant friendship created (mutual): {user_id} and {friend_uuid}")

            # Broadcast friend_request_accepted event to BOTH users (mutual acceptance)
            asyncio.create_task(
                self.event_manager.broadcast(
                    **FriendshipEvents.friend_request_accepted(
                        requester_id=user_id,
                        friend_id=friend_uuid,
                        friend_screen_name=friend.screen_name,
                        friendship_id=friendship.id
                    )
                )
            )
            asyncio.create_task(
                self.event_manager.broadcast(
                    **FriendshipEvents.friend_request_accepted(
                        requester_id=friend_uuid,
                        friend_id=user_id,
                        friend_screen_name=user.screen_name,
                        friendship_id=friendship.id
                    )
                )
            )

            return {
                'type': 'friendship',
                'data': friendship,
                'auto_accepted': True
            }

        # Create new friend request (normal flow)
        friend_request = FriendRequestAggregate.create(
            requester_id=user_id,
            recipient_id=friend_uuid
        )

        # Persist
        self.friend_request_repo.save(friend_request)
        logger.info(f"Friend request sent from {user_id} to {friend_uuid}")

        # Broadcast friend_request_received event to recipient
        asyncio.create_task(
            self.event_manager.broadcast(
                **FriendshipEvents.friend_request_received(
                    recipient_id=friend_uuid,
                    requester_id=user_id,
                    requester_screen_name=user.screen_name,
                    request_id=friend_request.id
                )
            )
        )

        return {
            'type': 'friend_request',
            'data': friend_request,
            'auto_accepted': False
        }


class AcceptFriendRequest:
    """
    Accept an incoming friend request.

    Deletes the friend_request and creates a friendship.
    """

    def __init__(
        self,
        friendship_repository: FriendshipRepository,
        friend_request_repository: FriendRequestRepository,
        user_repository: UserRepository,
        event_manager: EventManager
    ):
        self.friendship_repo = friendship_repository
        self.friend_request_repo = friend_request_repository
        self.user_repo = user_repository
        self.event_manager = event_manager

    def execute(self, user_id: UUID, requester_id: UUID) -> FriendshipAggregate:
        """
        Accept friend request.

        Validation:
        - Request must exist
        - User must be the recipient (not the sender)
        """
        # Get friend request
        friend_request = self.friend_request_repo.get_by_ids(requester_id, user_id)
        if not friend_request:
            raise ValueError("Friend request not found")

        # Verify this user is the recipient
        if friend_request.recipient_id != user_id:
            raise ValueError("Cannot accept a friend request you sent")

        # Get both users for screen names
        requester = self.user_repo.get_by_id(requester_id)
        recipient = self.user_repo.get_by_id(user_id)

        # Delete the friend request
        self.friend_request_repo.delete(requester_id, user_id)

        # Create friendship with canonical ordering
        friendship = FriendshipAggregate.create(requester_id, user_id)
        self.friendship_repo.save(friendship)

        logger.info(f"Friend request accepted: {requester_id} and {user_id} are now friends")

        # Broadcast friend_request_accepted event to requester
        asyncio.create_task(
            self.event_manager.broadcast(
                **FriendshipEvents.friend_request_accepted(
                    requester_id=requester_id,
                    friend_id=user_id,
                    friend_screen_name=recipient.screen_name,
                    friendship_id=friendship.id
                )
            )
        )

        return friendship


class DeclineFriendRequest:
    """Decline an incoming friend request (delete it)"""

    def __init__(
        self,
        friend_request_repository: FriendRequestRepository
    ):
        self.friend_request_repo = friend_request_repository

    def execute(self, user_id: UUID, requester_id: UUID) -> bool:
        """
        Decline friend request by deleting it.

        Validation:
        - Request must exist
        - User must be the recipient
        """
        # Get friend request
        friend_request = self.friend_request_repo.get_by_ids(requester_id, user_id)
        if not friend_request:
            raise ValueError("Friend request not found")

        # Verify this user is the recipient
        if friend_request.recipient_id != user_id:
            raise ValueError("Cannot decline a friend request you sent")

        # Delete the request
        success = self.friend_request_repo.delete(requester_id, user_id)
        if success:
            logger.info(f"Friend request declined: {requester_id} -> {user_id}")
            # No notification sent - prevents harassment and maintains privacy

        return success
























































class RemoveFriend:
    """Remove a friend (unfriend) - deletes the friendship"""

    def __init__(
        self,
        friendship_repository: FriendshipRepository
    ):
        self.friendship_repo = friendship_repository

    def execute(self, user_id: UUID, friend_id: UUID) -> bool:
        """
        Remove friendship (can be done by either user).

        Uses canonical ordering to find friendship.

        Validation:
        - Friendship must exist
        - User must be part of the friendship
        """
        # Get friendship using canonical IDs
        friendship = self.friendship_repo.get_by_canonical_ids(user_id, friend_id)
        if not friendship:
            raise ValueError("Friendship not found")

        # Verify user is part of this friendship
        if not friendship.involves_user(user_id):
            raise ValueError("You are not part of this friendship")

        # Delete the friendship
        success = self.friendship_repo.delete(user_id, friend_id)
        if success:
            logger.info(f"Friendship removed: {user_id} and {friend_id}")
            # No event broadcast needed - user will see updated state on next refresh

        return success
