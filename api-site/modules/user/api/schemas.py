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


class SetAccountNameRequest(BaseModel):
    """
    Request schema for setting user's immutable account name.

    The account_name will be combined with a server-generated 4-digit tag
    to create a unique identifier like "claude#2345".

    Validation rules:
    - 3-20 characters
    - Alphanumeric + dash + underscore only
    - Must start with letter or number
    """
    account_name: str


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
    friend_code: Optional[str]  # DEPRECATED - use account_identifier
    account_name: Optional[str]  # Immutable username (e.g., "claude")
    account_tag: Optional[str]  # 4-digit discriminator (e.g., "2345")
    account_identifier: Optional[str]  # Combined format: "claude#2345"
    created_at: datetime
    last_login: Optional[datetime]


class PublicUserResponse(BaseModel):
    """
    Public user response schema - for user lookups by other users.

    Returns minimal user information without sensitive data like email.
    Used for friend lookups, public profiles, etc.
    """
    id: str
    screen_name: Optional[str]
    friend_code: Optional[str]  # DEPRECATED - use account_identifier
    account_name: Optional[str]  # Immutable username
    account_tag: Optional[str]  # 4-digit discriminator
    account_identifier: Optional[str]  # Combined format: "name#tag"
    created_at: datetime


class AccountNameResponse(BaseModel):
    """
    Response schema after setting account name.

    Returns the full account identifier including the generated tag.
    """
    account_name: str
    account_tag: str
    account_identifier: str  # Combined format: "claude#2345"


class UserLoginResponse(BaseModel):
    """
    Enhanced login response with additional context.

    Wraps UserResponse with metadata about the login operation.
    """
    user: UserResponse
    message: str
    created: bool  # True if user was created, False if existing user logged in
