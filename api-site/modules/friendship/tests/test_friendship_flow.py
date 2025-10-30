# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Tests for friendship management flow.

Covers:
1. Creating friendships
2. Canonical ordering (user1_id < user2_id)
3. Preventing self-friending
4. Querying friendships
5. Deleting friendships
"""

import pytest

from modules.friendship.application.commands import (
    SendFriendRequest,
    AcceptFriendRequest,
    RemoveFriend
)
from modules.friendship.application.queries import GetUserFriends


class TestFriendshipFlow:
    """Tests for friendship management"""

    def test_users_can_become_friends(
        self,
        create_user,
        friendship_repo,
        friend_request_repo,
        user_repo
    ):
        """
        GIVEN: User A and User B exist
        WHEN: User A sends friend request and User B accepts
        THEN: Friendship exists with canonical ordering (user1_id < user2_id)
        AND: Both users can query the friendship
        """
        # GIVEN: Two users
        user_a = create_user("usera@example.com", "UserA")
        user_b = create_user("userb@example.com", "UserB")

        # WHEN: User A sends request
        send_cmd = SendFriendRequest(friendship_repo, friend_request_repo, user_repo)
        send_cmd.execute(user_id=user_a.id, friend_uuid=user_b.id)

        # WHEN: User B accepts
        accept_cmd = AcceptFriendRequest(friendship_repo, friend_request_repo)
        friendship = accept_cmd.execute(user_id=user_b.id, requester_id=user_a.id)

        # THEN: Friendship exists
        assert friendship is not None

        # THEN: Canonical ordering enforced (smaller UUID first)
        expected_user1 = min(user_a.id, user_b.id)
        expected_user2 = max(user_a.id, user_b.id)
        assert friendship.user1_id == expected_user1
        assert friendship.user2_id == expected_user2

        # THEN: Both users can query the friendship
        query = GetUserFriends(friendship_repo)
        user_a_friends = query.execute(user_a.id)
        user_b_friends = query.execute(user_b.id)

        assert len(user_a_friends) == 1
        assert len(user_b_friends) == 1
        assert user_a_friends[0].id == friendship.id
        assert user_b_friends[0].id == friendship.id

    def test_cannot_friend_yourself(
        self,
        create_user,
        friendship_repo,
        friend_request_repo,
        user_repo
    ):
        """
        GIVEN: User A exists
        WHEN: Trying to send friend request to yourself
        THEN: Raises ValueError
        """
        # GIVEN: User
        user = create_user("user@example.com")

        # WHEN: Trying to friend self
        send_cmd = SendFriendRequest(friendship_repo, friend_request_repo, user_repo)

        # THEN: Raises error
        with pytest.raises(ValueError):
            send_cmd.execute(user_id=user.id, friend_uuid=user.id)

    def test_friendship_canonical_ordering(
        self,
        create_user,
        friendship_repo,
        friend_request_repo,
        user_repo
    ):
        """
        GIVEN: User A (UUID < User B UUID)
        WHEN: Creating friendship via request/accept
        THEN: Always stored as (A, B) with user1_id < user2_id
        AND: Prevents duplicate friendships
        """
        # GIVEN: Two users
        user_a = create_user("usera@example.com")
        user_b = create_user("userb@example.com")

        # Determine canonical order
        if user_a.id > user_b.id:
            user_a, user_b = user_b, user_a

        # WHEN: User A sends request, User B accepts
        send_cmd = SendFriendRequest(friendship_repo, friend_request_repo, user_repo)
        send_cmd.execute(user_id=user_a.id, friend_uuid=user_b.id)

        accept_cmd = AcceptFriendRequest(friendship_repo, friend_request_repo)
        friendship1 = accept_cmd.execute(user_id=user_b.id, requester_id=user_a.id)

        # THEN: Stored with canonical order
        assert friendship1.user1_id == user_a.id
        assert friendship1.user2_id == user_b.id

        # WHEN: Trying to create reverse friendship
        # THEN: Should raise error (already friends)
        with pytest.raises(ValueError, match="already friends"):
            send_cmd.execute(user_id=user_b.id, friend_uuid=user_a.id)

    def test_can_get_user_friendships(
        self,
        create_user,
        create_friendship,
        friendship_repo
    ):
        """
        GIVEN: User A is friends with B and C
        WHEN: Querying friendships for User A
        THEN: Returns both friendships
        AND: Can determine other user in each friendship
        """
        # GIVEN: Three users
        user_a = create_user("usera@example.com", "UserA")
        user_b = create_user("userb@example.com", "UserB")
        user_c = create_user("userc@example.com", "UserC")

        # GIVEN: A is friends with B and C
        friendship_ab = create_friendship(user_a.id, user_b.id)
        friendship_ac = create_friendship(user_a.id, user_c.id)

        # WHEN: Querying User A's friendships
        query = GetUserFriends(friendship_repo)
        user_a_friends = query.execute(user_a.id)

        # THEN: Returns both friendships
        assert len(user_a_friends) == 2
        friendship_ids = {f.id for f in user_a_friends}
        assert friendship_ab.id in friendship_ids
        assert friendship_ac.id in friendship_ids

        # THEN: Can determine other user in each friendship
        for friendship in user_a_friends:
            other_user = friendship.get_other_user(user_a.id)
            assert other_user in [user_b.id, user_c.id]
            assert other_user != user_a.id

    def test_can_delete_friendship(
        self,
        create_user,
        create_friendship,
        friendship_repo
    ):
        """
        GIVEN: Friendship exists between A and B
        WHEN: User removes friendship
        THEN: Friendship no longer exists
        AND: Users are no longer friends
        """
        # GIVEN: Two users with friendship
        user_a = create_user("usera@example.com")
        user_b = create_user("userb@example.com")
        friendship = create_friendship(user_a.id, user_b.id)

        # Verify friendship exists
        query = GetUserFriends(friendship_repo)
        assert len(query.execute(user_a.id)) == 1

        # WHEN: User A removes the friendship
        remove_cmd = RemoveFriend(friendship_repo)
        remove_cmd.execute(user_id=user_a.id, friend_id=user_b.id)

        # THEN: Friendship no longer exists
        assert len(query.execute(user_a.id)) == 0
        assert len(query.execute(user_b.id)) == 0
