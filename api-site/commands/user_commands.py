# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy.orm import Session
from services.user_service import UserService
from models.user import User
from typing import Optional, Tuple
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