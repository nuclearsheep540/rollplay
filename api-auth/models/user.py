# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

class UserBase(BaseModel):
    """Base user model"""
    email: EmailStr
    display_name: Optional[str] = None

class UserCreate(UserBase):
    """User creation model"""
    pass

class UserUpdate(BaseModel):
    """User update model"""
    display_name: Optional[str] = None

class UserResponse(UserBase):
    """User response model"""
    id: str
    created_at: Optional[str] = None
    last_login: Optional[str] = None

class User(UserBase):
    """Complete user model"""
    id: str
    created_at: str
    last_login: Optional[str] = None
    is_active: bool = True