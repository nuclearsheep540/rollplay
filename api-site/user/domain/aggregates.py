# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID
import re


def utc_now():
    return datetime.now(timezone.utc)


@dataclass
class UserAggregate:
    """
    User domain aggregate - encapsulates user business rules and invariants.

    Business Rules:
    - Email must be valid format and unique
    - Email cannot be changed (immutable after creation)
    - Last login is recorded automatically
    - User creation requires valid email
    """
    id: Optional[UUID]
    email: str
    screen_name: Optional[str]
    created_at: datetime
    last_login: Optional[datetime] = None

    # Email validation regex - RFC 5322 compliant
    _EMAIL_REGEX = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')

    @classmethod
    def create(cls, email: str) -> 'UserAggregate':
        """
        Create new user with business rules validation.

        Business Rules Enforced:
        - Email must be valid format
        - Email length cannot exceed 254 characters (RFC 5322)
        - Email is normalized (lowercase, trimmed)

        Args:
            email: User's email address

        Returns:
            UserAggregate: New user aggregate

        Raises:
            ValueError: If email is invalid
        """
        # Normalize email
        normalized_email = email.lower().strip()

        # Validate email format
        if not cls._is_valid_email(normalized_email):
            raise ValueError("Invalid email format")

        # Validate email length (RFC 5322 limit)
        if len(normalized_email) > 254:
            raise ValueError("Email address too long (maximum 254 characters)")

        return cls(
            id=None,  # Set by repository after persistence
            email=normalized_email,
            screen_name=None,  # To be set later by user
            created_at=datetime.utcnow(),
            last_login=None
        )

    def record_login(self):
        """
        Business rule: Record user login timestamp.

        Updates the last_login field to current UTC time.
        """
        self.last_login = utc_now()

    def update_screen_name(self, screen_name: str):
        """
        Business rule: Update user screen name with validation.

        Business Rules Enforced:
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

    def is_recently_active(self, hours: int = 24) -> bool:
        """
        Business rule: Check if user has been active recently.

        Args:
            hours: Number of hours to consider as "recent" (default 24)

        Returns:
            bool: True if user logged in within the specified hours
        """
        if not self.last_login:
            return False

        time_threshold = utc_now() - timedelta(hours=hours)
        return self.last_login > time_threshold

    @classmethod
    def _is_valid_email(cls, email: str) -> bool:
        """
        Private method to validate email format.

        Args:
            email: Email to validate

        Returns:
            bool: True if email format is valid
        """
        if not email:
            return False

        return bool(cls._EMAIL_REGEX.match(email))
