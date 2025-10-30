# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List
from uuid import UUID

from modules.friendship.repositories.friendship_repository import FriendshipRepository
from modules.friendship.repositories.friend_request_repository import FriendRequestRepository
from modules.friendship.domain.friendship_aggregate import FriendshipAggregate
from modules.friendship.domain.friend_request_aggregate import FriendRequestAggregate


class GetUserFriends:
    """Get all accepted friends for a user"""

    def __init__(self, friendship_repository: FriendshipRepository):
        self.friendship_repo = friendship_repository

    def execute(self, user_id: UUID) -> List[FriendshipAggregate]:
        """Get all friendships for a user (all are accepted by definition)"""
        return self.friendship_repo.get_user_friendships(user_id)


class GetPendingFriendRequests:
    """Get all incoming pending friend requests for a user"""

    def __init__(self, friend_request_repository: FriendRequestRepository):
        self.friend_request_repo = friend_request_repository

    def execute(self, user_id: UUID) -> List[FriendRequestAggregate]:
        """Get all pending friend requests sent TO this user (incoming)"""
        return self.friend_request_repo.get_requests_to_user(user_id)


class GetSentFriendRequests:
    """Get all outgoing pending friend requests from a user"""

    def __init__(self, friend_request_repository: FriendRequestRepository):
        self.friend_request_repo = friend_request_repository

    def execute(self, user_id: UUID) -> List[FriendRequestAggregate]:
        """Get all pending friend requests sent BY this user (outgoing)"""
        return self.friend_request_repo.get_requests_from_user(user_id)


class GetAllUserFriendships:
    """
    Get all friendships and friend requests for a user, fully categorized.

    No in-memory filtering needed - database queries handle direction.
    """

    def __init__(
        self,
        friendship_repository: FriendshipRepository,
        friend_request_repository: FriendRequestRepository
    ):
        self.friendship_repo = friendship_repository
        self.friend_request_repo = friend_request_repository

    def execute(self, user_id: UUID) -> dict:
        """
        Get all friendships and friend requests categorized.

        Returns dict with:
        - accepted: List[FriendshipAggregate] (all friendships)
        - incoming_requests: List[FriendRequestAggregate] (requests TO user)
        - outgoing_requests: List[FriendRequestAggregate] (requests FROM user)
        """
        # Fetch all accepted friendships
        accepted = self.friendship_repo.get_user_friendships(user_id)

        # Fetch incoming friend requests (TO user)
        incoming_requests = self.friend_request_repo.get_requests_to_user(user_id)

        # Fetch outgoing friend requests (FROM user)
        outgoing_requests = self.friend_request_repo.get_requests_from_user(user_id)

        return {
            'accepted': accepted,
            'incoming_requests': incoming_requests,
            'outgoing_requests': outgoing_requests
        }
