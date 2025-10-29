# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from uuid import UUID
import logging

from modules.friendship.repositories.friendship_repository import FriendshipRepository
from modules.user.orm.user_repository import UserRepository
from modules.friendship.domain.friendship_aggregate import FriendshipAggregate

logger = logging.getLogger(__name__)


class SendFriendRequest:
    """Send a friend request to another user"""

    def __init__(
        self,
        friendship_repository: FriendshipRepository,
        user_repository: UserRepository
    ):
        self.friendship_repo = friendship_repository
        self.user_repo = user_repository

    def execute(self, user_id: UUID, friend_uuid: UUID) -> FriendshipAggregate:
        """
        Send friend request by friend's UUID.

        Validation:
        - Both users must exist
        - Cannot friend yourself
        - Cannot send duplicate request
        """
        # Validate both users exist
        user = self.user_repo.get_by_id(user_id)
        if not user:
            raise ValueError(f"User {user_id} not found")

        friend = self.user_repo.get_by_id(friend_uuid)
        if not friend:
            raise ValueError(f"Friend user {friend_uuid} not found")

        # Check if friendship already exists (in any direction)
        existing = self.friendship_repo.get_by_ids(user_id, friend_uuid)
        if existing:
            if existing.is_accepted():
                raise ValueError("You are already friends with this user")
            elif existing.is_pending():
                raise ValueError("Friend request already pending")

        # Create new friendship request
        friendship = FriendshipAggregate.create(user_id=user_id, friend_id=friend_uuid)

        # Persist
        self.friendship_repo.save(friendship)
        logger.info(f"Friend request sent from {user_id} to {friend_uuid}")

        return friendship


class AcceptFriendRequest:
    """Accept an incoming friend request"""

    def __init__(self, friendship_repository: FriendshipRepository):
        self.friendship_repo = friendship_repository

    def execute(self, user_id: UUID, requester_id: UUID) -> FriendshipAggregate:
        """
        Accept friend request.

        Validation:
        - Request must exist
        - Request must be pending
        - User must be the recipient (not the sender)
        """
        # Get friendship
        friendship = self.friendship_repo.get_by_ids(user_id, requester_id)
        if not friendship:
            raise ValueError("Friend request not found")

        # Verify this user is the recipient (friend_id in the friendship)
        if friendship.friend_id != user_id:
            raise ValueError("Cannot accept a friend request you sent")

        # Accept the request
        friendship.accept()

        # Persist
        self.friendship_repo.save(friendship)
        logger.info(f"Friend request accepted: {requester_id} and {user_id} are now friends")

        return friendship


class DeclineFriendRequest:
    """Decline an incoming friend request"""

    def __init__(self, friendship_repository: FriendshipRepository):
        self.friendship_repo = friendship_repository

    def execute(self, user_id: UUID, requester_id: UUID) -> bool:
        """
        Decline friend request by deleting it.

        Validation:
        - Request must exist
        - User must be the recipient
        """
        # Get friendship
        friendship = self.friendship_repo.get_by_ids(user_id, requester_id)
        if not friendship:
            raise ValueError("Friend request not found")

        # Verify this user is the recipient
        if friendship.friend_id != user_id:
            raise ValueError("Cannot decline a friend request you sent")

        # Delete the request
        success = self.friendship_repo.delete(user_id, requester_id)
        if success:
            logger.info(f"Friend request declined: {requester_id} -> {user_id}")

        return success


class RemoveFriend:
    """Remove a friend (unfriend)"""

    def __init__(self, friendship_repository: FriendshipRepository):
        self.friendship_repo = friendship_repository

    def execute(self, user_id: UUID, friend_id: UUID) -> bool:
        """
        Remove friendship (can be done by either user).

        Validation:
        - Friendship must exist
        - User must be part of the friendship
        """
        # Get friendship
        friendship = self.friendship_repo.get_by_ids(user_id, friend_id)
        if not friendship:
            raise ValueError("Friendship not found")

        # Verify user is part of this friendship
        if not friendship.involves_user(user_id):
            raise ValueError("You are not part of this friendship")

        # Delete the friendship
        success = self.friendship_repo.delete(user_id, friend_id)
        if success:
            logger.info(f"Friendship removed: {user_id} and {friend_id}")

        return success
