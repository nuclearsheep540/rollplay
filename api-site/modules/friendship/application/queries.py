# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List
from uuid import UUID

from modules.friendship.repositories.friendship_repository import FriendshipRepository
from modules.friendship.domain.friendship_aggregate import FriendshipAggregate, FriendshipStatus


class GetUserFriends:
    """Get all accepted friends for a user"""

    def __init__(self, friendship_repository: FriendshipRepository):
        self.friendship_repo = friendship_repository

    def execute(self, user_id: UUID) -> List[FriendshipAggregate]:
        """Get all accepted friendships for a user"""
        return self.friendship_repo.get_user_friendships(user_id, status=FriendshipStatus.ACCEPTED)


class GetPendingFriendRequests:
    """Get all incoming pending friend requests for a user"""

    def __init__(self, friendship_repository: FriendshipRepository):
        self.friendship_repo = friendship_repository

    def execute(self, user_id: UUID) -> List[FriendshipAggregate]:
        """Get all pending friend requests sent TO this user"""
        return self.friendship_repo.get_pending_requests_to_user(user_id)


class GetSentFriendRequests:
    """Get all outgoing pending friend requests from a user"""

    def __init__(self, friendship_repository: FriendshipRepository):
        self.friendship_repo = friendship_repository

    def execute(self, user_id: UUID) -> List[FriendshipAggregate]:
        """Get all pending friend requests sent BY this user"""
        return self.friendship_repo.get_pending_requests_from_user(user_id)
