# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy.orm import Session
from models.user import User
from typing import Optional
from datetime import datetime

class UserService:
    """Service layer for user operations"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_user_by_id(self, id: int):
        return self.db.query(User).filter(User.id == id).first()

    def get_user_by_email(self, email: str) -> Optional[User]:
        return self.db.query(User).filter(User.email == email).first()
    
    def create_user(self, email: str) -> User:
        new_user = User(
            email=email,
            created_at=datetime.now()
        )
        
        self.db.add(new_user)
        self.db.commit()
        self.db.refresh(new_user)
        
        return new_user.id