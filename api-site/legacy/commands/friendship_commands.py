# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy.orm import Session
from services.friendship_service import FriendshipService
from models.friendship import Friendship
from models.user import User
from typing import Optional, List
from uuid import UUID

class SendFriendRequest:
    """Command to send a friend request"""
    
    def __init__(self, db: Session):
        self.db = db
        self.friendship_service = FriendshipService(db)
    
    def execute(self, requester_id: UUID, addressee_screen_name: str) -> Friendship:
        """Send a friend request to a user by screen name"""
        return self.friendship_service.send_friend_request(requester_id, addressee_screen_name)

class AcceptFriendRequest:
    """Command to accept a friend request"""
    
    def __init__(self, db: Session):
        self.db = db
        self.friendship_service = FriendshipService(db)
    
    def execute(self, friendship_id: UUID, user_id: UUID) -> Friendship:
        """Accept a friend request"""
        return self.friendship_service.accept_friend_request(friendship_id, user_id)

class RejectFriendRequest:
    """Command to reject a friend request"""
    
    def __init__(self, db: Session):
        self.db = db
        self.friendship_service = FriendshipService(db)
    
    def execute(self, friendship_id: UUID, user_id: UUID) -> Friendship:
        """Reject a friend request"""
        return self.friendship_service.reject_friend_request(friendship_id, user_id)

class RemoveFriend:
    """Command to remove a friend"""
    
    def __init__(self, db: Session):
        self.db = db
        self.friendship_service = FriendshipService(db)
    
    def execute(self, user_id: UUID, friend_id: UUID) -> bool:
        """Remove a friend"""
        return self.friendship_service.remove_friend(user_id, friend_id)

class GetFriendsList:
    """Command to get user's friends list"""
    
    def __init__(self, db: Session):
        self.db = db
        self.friendship_service = FriendshipService(db)
    
    def execute(self, user_id: UUID) -> List[User]:
        """Get list of user's friends"""
        return self.friendship_service.get_friends_list(user_id)

class GetPendingFriendRequests:
    """Command to get pending friend requests"""
    
    def __init__(self, db: Session):
        self.db = db
        self.friendship_service = FriendshipService(db)
    
    def execute(self, user_id: UUID) -> List[Friendship]:
        """Get pending friend requests sent to the user"""
        return self.friendship_service.get_pending_friend_requests(user_id)

class GetSentFriendRequests:
    """Command to get sent friend requests"""
    
    def __init__(self, db: Session):
        self.db = db
        self.friendship_service = FriendshipService(db)
    
    def execute(self, user_id: UUID) -> List[Friendship]:
        """Get pending friend requests sent by the user"""
        return self.friendship_service.get_sent_friend_requests(user_id)