# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional


# REQUEST SCHEMAS

class UserEmailRequest(BaseModel):
    """
    Request schema for operations requiring user email.

    Used for login, create, and email-based operations.
    Only performs structural validation - business rules enforced in domain layer.
    """
    email: EmailStr


# RESPONSE SCHEMAS

class UserResponse(BaseModel):
    """
    Standard user response schema - reused across all user endpoints.

    This schema defines the structure of user data returned from API endpoints.
    Excludes sensitive information and formats data for client consumption.
    """
    id: str
    email: str
    screen_name: Optional[str]
    created_at: datetime
    last_login: Optional[datetime]
    is_recently_active: bool


class UserLoginResponse(BaseModel):
    """
    Enhanced login response with additional context.

    Wraps UserResponse with metadata about the login operation.
    """
    user: UserResponse
    message: str
    created: bool  # True if user was created, False if existing user logged in
