# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy.orm import Session
from services.user_service import UserService
from models.user import User
from typing import Optional, Tuple
from uuid import UUID
import logging

logger = logging.getLogger(__name__)

class GetOrCreateUser:
    def __init__(self, db: Session):
        self.db = db
        self.user_service = UserService(db)
    
    def execute(self, email: str) -> Tuple[User, bool]:
        """
        When a user authenticates with our service
        we need to check if their user exists
        else create them

        Args:
            email: User's email address
            
        Returns:
            Tuple[User, bool]: (user_object, was_created)
        """
        # Check if user exists
        existing_user = self.user_service.get_user_by_email(email)
        
        if existing_user:
            logger.info(f"User found: {email}")
            return existing_user, False
               
        # Create new user
        new_user_id = self.user_service.create_user(email)
        logger.info(f"User created: {email}")
        
        return new_user_id, True

class AddTempGameId:
    """Command to add a temporary game ID to a user"""
    
    def __init__(self, db: Session):
        self.db = db
        self.user_service = UserService(db)
    
    def execute(self, user_id: UUID, game_id: str) -> Optional[User]:
        """Add a temporary game ID to user's list"""
        return self.user_service.add_temp_game_id(user_id, game_id)

class UpdateScreenName:
    """Command to update a user's screen name"""
    
    def __init__(self, db: Session):
        self.db = db
        self.user_service = UserService(db)
    
    def execute(self, user_id: UUID, screen_name: str) -> Optional[User]:
        """Update user's screen name"""
        # Validate screen name (basic validation)
        if not screen_name or not screen_name.strip():
            raise ValueError("Screen name cannot be empty")
        
        screen_name = screen_name.strip()
        
        # Check if screen name is already taken
        existing_user = self.db.query(User).filter(User.screen_name == screen_name, User.id != user_id).first()
        if existing_user:
            raise ValueError("Screen name is already taken")
        
        return self.user_service.update_screen_name(user_id, screen_name)