# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from models.friendship import Friendship
from models.user import User
from typing import Optional, List
from datetime import datetime
from uuid import UUID

class FriendshipService:
    """Service layer for friendship operations"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def send_friend_request(self, requester_id: UUID, addressee_screen_name: str) -> Optional[Friendship]:
        """Send a friend request to a user by screen name"""
        # Find the addressee by screen name
        addressee = self.db.query(User).filter(User.screen_name == addressee_screen_name).first()
        if not addressee:
            raise ValueError(f"User with screen name '{addressee_screen_name}' not found")
        
        # Check if they're trying to friend themselves
        if requester_id == addressee.id:
            raise ValueError("Cannot send friend request to yourself")
        
        # Check if friendship already exists (in either direction)
        existing_friendship = self.db.query(Friendship).filter(
            or_(
                and_(Friendship.requester_id == requester_id, Friendship.addressee_id == addressee.id),
                and_(Friendship.requester_id == addressee.id, Friendship.addressee_id == requester_id)
            )
        ).first()
        
        if existing_friendship:
            if existing_friendship.status == "accepted":
                raise ValueError("Already friends with this user")
            elif existing_friendship.status == "pending":
                raise ValueError("Friend request already pending")
            elif existing_friendship.status == "blocked":
                raise ValueError("Cannot send friend request to this user")
        
        # Create new friendship request
        friendship = Friendship(
            requester_id=requester_id,
            addressee_id=addressee.id,
            status="pending"
        )
        
        self.db.add(friendship)
        self.db.commit()
        self.db.refresh(friendship)
        
        return friendship
    
    def accept_friend_request(self, friendship_id: UUID, user_id: UUID) -> Optional[Friendship]:
        """Accept a friend request"""
        friendship = self.db.query(Friendship).filter(
            Friendship.id == friendship_id,
            Friendship.addressee_id == user_id,
            Friendship.status == "pending"
        ).first()
        
        if not friendship:
            raise ValueError("Friend request not found or already processed")
        
        friendship.status = "accepted"
        friendship.updated_at = datetime.utcnow()
        
        self.db.commit()
        self.db.refresh(friendship)
        
        return friendship
    
    def reject_friend_request(self, friendship_id: UUID, user_id: UUID) -> Optional[Friendship]:
        """Reject a friend request"""
        friendship = self.db.query(Friendship).filter(
            Friendship.id == friendship_id,
            Friendship.addressee_id == user_id,
            Friendship.status == "pending"
        ).first()
        
        if not friendship:
            raise ValueError("Friend request not found or already processed")
        
        friendship.status = "rejected"
        friendship.updated_at = datetime.utcnow()
        
        self.db.commit()
        self.db.refresh(friendship)
        
        return friendship
    
    def remove_friend(self, user_id: UUID, friend_id: UUID) -> bool:
        """Remove a friend (delete the friendship)"""
        friendship = self.db.query(Friendship).filter(
            or_(
                and_(Friendship.requester_id == user_id, Friendship.addressee_id == friend_id),
                and_(Friendship.requester_id == friend_id, Friendship.addressee_id == user_id)
            ),
            Friendship.status == "accepted"
        ).first()
        
        if not friendship:
            raise ValueError("Friendship not found")
        
        self.db.delete(friendship)
        self.db.commit()
        
        return True
    
    def get_friends_list(self, user_id: UUID) -> List[User]:
        """Get list of user's friends"""
        friendships = self.db.query(Friendship).filter(
            or_(
                Friendship.requester_id == user_id,
                Friendship.addressee_id == user_id
            ),
            Friendship.status == "accepted"
        ).all()
        
        friends = []
        for friendship in friendships:
            if friendship.requester_id == user_id:
                friends.append(friendship.addressee)
            else:
                friends.append(friendship.requester)
        
        return friends
    
    def get_pending_friend_requests(self, user_id: UUID) -> List[Friendship]:
        """Get pending friend requests sent to the user"""
        return self.db.query(Friendship).filter(
            Friendship.addressee_id == user_id,
            Friendship.status == "pending"
        ).all()
    
    def get_sent_friend_requests(self, user_id: UUID) -> List[Friendship]:
        """Get pending friend requests sent by the user"""
        return self.db.query(Friendship).filter(
            Friendship.requester_id == user_id,
            Friendship.status == "pending"
        ).all()
    
    def are_friends(self, user_id: UUID, friend_id: UUID) -> bool:
        """Check if two users are friends"""
        friendship = self.db.query(Friendship).filter(
            or_(
                and_(Friendship.requester_id == user_id, Friendship.addressee_id == friend_id),
                and_(Friendship.requester_id == friend_id, Friendship.addressee_id == user_id)
            ),
            Friendship.status == "accepted"
        ).first()
        
        return friendship is not None