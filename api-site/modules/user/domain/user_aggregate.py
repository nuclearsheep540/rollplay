# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from uuid import UUID
from enum import Enum
import re

class InviteStatus(str, Enum):
    """
    When inviting a player to a game
    we store the status of the invite
    """

    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"

    def __str__(self) -> str:
        return self.value

@dataclass
class GameInvites:
    """Represents a game invite for a user"""
    game_id: UUID
    game_host: str
    game_name: str
    invite_status: InviteStatus

def utc_now():
    return datetime.now(timezone.utc)

@dataclass
class UserAggregate:
    """
    Users are the literal people behind the account created and are considered end-users.
    """
    id: Optional[UUID]
    email: str
    screen_name: Optional[str]
    created_at: datetime
    last_login: Optional[datetime] = None
    game_invites: Optional[List[GameInvites]] = None

    @classmethod
    def create(cls, email: str) -> 'UserAggregate':
        """
        Create new user with business rules validation.

        - Email must be valid format
        - Email length cannot exceed 254 characters (RFC 5322)
        - Email is normalized (lowercase, trimmed)

        Args:
            email: User's email address

        Returns:
            UserAggregate: New user aggregate
        """

        normalized_email = email.lower().strip()
        if not cls._is_valid_email(normalized_email):
            raise ValueError("Invalid email format")

        # Validate email length (RFC 5322 limit)
        if len(normalized_email) > 254:
            raise ValueError("Email address too long (maximum 254 characters)")
        
        # We create accounts on first log in, so this event is technically a login
        cls.record_login()

        return cls(
            id=None,  # Set by repository after persistence
            email=normalized_email,
            screen_name=None,  # To be set later by user
            created_at=utc_now(),
            last_login=None
        )

    def record_login(self):
        """
        Updates the last_login field to current UTC time.
        """
        self.last_login = utc_now()

    def update_screen_name(self, screen_name: str):
        """
        Update user screen name with validation.

        - Screen name must be 1-30 characters
        - Screen name cannot be empty or just whitespace
        - Screen name is trimmed of whitespace

        Args:
            screen_name: New screen name for the user

        Raises:
            ValueError: If screen name is invalid
        """
        if not screen_name:
            raise ValueError("Screen name cannot be empty")

        # Normalize screen name
        normalized_name = screen_name.strip()

        if not normalized_name:
            raise ValueError("Screen name cannot be empty or just whitespace")

        if len(normalized_name) < 1:
            raise ValueError("Screen name must be at least 1 character")

        if len(normalized_name) > 30:
            raise ValueError("Screen name cannot exceed 30 characters")

        self.screen_name = normalized_name

    @classmethod
    def _is_valid_email(cls, email: str) -> bool:
        """
        Private method to validate email format.
        """
        if not email:
            return False

        # Email validation regex - RFC 5322 compliant
        _EMAIL_REGEX = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
        return bool(_EMAIL_REGEX.match(email))
