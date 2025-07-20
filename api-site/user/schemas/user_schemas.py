# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from pydantic import BaseModel, EmailStr, validator
from datetime import datetime
from typing import Optional

class UserCreateRequest(BaseModel):
    """
    Pydantic schema for user creation/login requests.
    
    This schema validates incoming API requests for user operations.
    Used for both new user creation and existing user login.
    """
    email: EmailStr
    
    @validator('email')
    def validate_email_length(cls, v):
        """Validate email length matches domain rules."""
        if len(v) > 254:
            raise ValueError('Email address too long (maximum 254 characters)')
        return v

class UserResponse(BaseModel):
    """
    Pydantic schema for user API responses.
    
    This schema defines the structure of user data returned from API endpoints.
    Excludes sensitive information and formats data for client consumption.
    """
    id: str
    email: str
    created_at: datetime
    last_login: Optional[datetime]
    is_recently_active: bool
    
    class Config:
        """Pydantic config for ORM integration."""
        from_attributes = True

class UserLoginRequest(BaseModel):
    """
    Pydantic schema for user login requests.
    
    Simplified schema for login operations where we only need email.
    """
    email: EmailStr

class UserLoginResponse(BaseModel):
    """
    Pydantic schema for user login responses.
    
    Enhanced response for login operations that includes authentication data.
    """
    user: UserResponse
    message: str
    created: bool  # True if user was created, False if existing user logged in
    
class UserByIdRequest(BaseModel):
    """
    Pydantic schema for user lookup by ID requests.
    """
    user_id: str