# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID
import re

def utc_now():
    return datetime.now(timezone.utc)

# Regex for validating account_name format
# - 3-30 characters
# - Alphanumeric + dash + underscore only
# - Must start with letter or number
_ACCOUNT_NAME_REGEX = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9_-]{2,29}$')

# Site-wide identity color palette (curated for legibility on dark surfaces —
# Matt, 2026-07-21). The user's color paints their account icon and their
# disc in other users' social panes; it is DISTINCT from characters.color
# (in-game persona color for seats/tokens). NULL = not chosen; display falls
# back to a deterministic hash into this same palette client-side.
USER_COLORS = [
    "#cda265", "#99cd65", "#70c285", "#5fd3d3",
    "#5979d9", "#9959d9", "#d959b9", "#d95959",
]


@dataclass
class UserAggregate:
    """
    Users are the literal people behind the account created and are considered end-users.
    """
    id: Optional[UUID]
    email: str
    screen_name: str  # NOT NULL; "" = not-yet-set (the FE name modal prompts on empty)
    created_at: datetime
    last_login: Optional[datetime] = None
    friend_code: Optional[str] = None  # DEPRECATED - use account_name + account_tag
    account_name: Optional[str] = None  # Immutable username (e.g., "claude")
    account_tag: Optional[str] = None  # 4-digit discriminator (e.g., "2345")
    color: Optional[str] = None  # Identity color hex from USER_COLORS; None = not chosen

    @property
    def account_identifier(self) -> Optional[str]:
        """
        Returns the full account identifier in format "name#tag" (e.g., "claude#2345").
        Returns None if account_name or account_tag is not set.
        """
        if self.account_name and self.account_tag:
            return f"{self.account_name}#{self.account_tag}"
        return None

    @property
    def has_account_name(self) -> bool:
        """Returns True if user has set their account name."""
        return self.account_name is not None and self.account_tag is not None

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

        return cls(
            id=None,  # Set by repository after persistence
            email=normalized_email,
            screen_name="",  # Set later by the user via the name modal ("" = unset; column is NOT NULL)
            created_at=utc_now(),
            last_login=utc_now()  # We create accounts on first login, so set last_login to now
        )

    def reactivate(self):
        """
        Reactivate a soft-deleted user account.

        Resets profile fields so the user goes through onboarding again,
        but preserves the email and ID.
        """
        self.screen_name = ""
        self.account_name = None
        self.account_tag = None
        self.last_login = utc_now()

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

    def set_color(self, color: str):
        """
        Set the user's identity color.

        Constrained to the curated USER_COLORS palette — a product choice
        for legibility (every option reads well on dark surfaces), not a
        formatting rule.

        Raises:
            ValueError: If the color is not one of USER_COLORS
        """
        if color not in USER_COLORS:
            raise ValueError("Color must be one of the identity palette options")
        self.color = color

    def set_account_name(self, account_name: str, account_tag: str):
        """
        Set the immutable account name and tag for friend lookups.

        This is a ONE-TIME operation - once set, cannot be changed.

        Validation rules for account_name:
        - 3-30 characters
        - Alphanumeric + dash + underscore only
        - Must start with letter or number
        - Stored as-entered (case preserved), compared case-insensitively

        Args:
            account_name: The chosen username (e.g., "claude")
            account_tag: 4-digit discriminator (e.g., "2345")

        Raises:
            ValueError: If account_name already set, or validation fails
        """
        # Check immutability - cannot change once set
        if self.account_name is not None:
            raise ValueError("Account name is immutable and cannot be changed")

        if not account_name:
            raise ValueError("Account name cannot be empty")

        # Validate format
        normalized_name = account_name.strip()
        if not _ACCOUNT_NAME_REGEX.match(normalized_name):
            raise ValueError(
                "Account name must be 3-30 characters, start with a letter or number, "
                "and contain only letters, numbers, dashes, and underscores"
            )

        # Validate tag format (4 digits)
        if not account_tag or not account_tag.isdigit() or len(account_tag) != 4:
            raise ValueError("Account tag must be exactly 4 digits")

        self.account_name = normalized_name
        self.account_tag = account_tag

    @classmethod
    def validate_account_name_format(cls, account_name: str) -> bool:
        """
        Validate account name format without setting it.
        Useful for pre-validation before attempting to set.

        Returns:
            bool: True if format is valid
        """
        if not account_name:
            return False
        return bool(_ACCOUNT_NAME_REGEX.match(account_name.strip()))

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
