# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4
import re

# How long a user must be gone before coming back is worth announcing. Covers
# a refresh, an HMR remount or a flaky moment of network without telling every
# friend the user left and returned.
PRESENCE_GRACE_SECONDS = 30

# The pulse is a sensor reading, not a log: it holds the few most recent things
# that happened near this user and forgets them soon after. Both bounds are
# deliberate — the cap keeps the line glanceable, the lifetime keeps it honest,
# because a pill saying "came online" is a claim about NOW.
MAX_PULSE_EVENTS = 5
PULSE_EVENT_LIFETIME_SECONDS = 6 * 60 * 60


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
    last_seen: Optional[datetime] = None  # When their last live connection closed
    friend_code: Optional[str] = None  # DEPRECATED - use account_name + account_tag
    account_name: Optional[str] = None  # Immutable username (e.g., "claude")
    account_tag: Optional[str] = None  # 4-digit discriminator (e.g., "2345")
    color: Optional[str] = None  # Identity color hex from USER_COLORS; None = not chosen
    # The user's pulse — newest first, capped and self-expiring. A value the
    # user owns rather than a relation: bounded, always read whole, and
    # meaningless split into rows. default_factory, never a shared list.
    pulse_events: List[Dict[str, Any]] = field(default_factory=list)
    max_slots: int = 4  # Character capacity; DB CHECK caps at 8

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

    def record_pulse_event(
        self,
        event_type: str,
        data: Dict[str, Any],
        lifetime_seconds: int = PULSE_EVENT_LIFETIME_SECONDS
    ) -> Dict[str, Any]:
        """
        Add something that just happened near this user to their pulse.

        The bucket maintains itself on every write — expired entries drop, a
        repeat of something already showing is refreshed rather than stacked,
        and the oldest falls off once the cap is reached. That is what removes
        the need for any scheduled cleanup: a bucket is only ever tidied by
        being used, and an untouched one is already bounded at MAX_PULSE_EVENTS.

        Repeats are matched on event type AND payload, so the same friend
        logging in twice in an evening occupies one slot rather than crowding
        out four other things. A different friend is a different payload, so
        they never collapse into each other.

        Args:
            event_type: The event's routing key (e.g. 'friend_online')
            data: The event payload, as broadcast
            lifetime_seconds: How long this entry stays true

        Returns:
            The stored entry
        """
        now = utc_now()

        entry = {
            "id": str(uuid4()),
            "event_type": event_type,
            "data": data,
            "created_at": now.isoformat(),
            "expires_at": (now + timedelta(seconds=lifetime_seconds)).isoformat(),
        }

        kept = []
        for existing in self.active_pulse_events(now):
            is_repeat = existing["event_type"] == event_type and existing["data"] == data
            if not is_repeat:
                kept.append(existing)

        # Newest first: the line reads left-to-right from the pulse source.
        self.pulse_events = [entry] + kept[:MAX_PULSE_EVENTS - 1]

        return entry

    def active_pulse_events(self, now: Optional[datetime] = None) -> List[Dict[str, Any]]:
        """
        The pulse entries that are still true.

        Expiry is applied on READ as well as on write, so an entry that lapsed
        while nothing was happening is invisible immediately rather than
        lingering until the next event tidies it away.

        Args:
            now: The moment to judge against; defaults to the current time

        Returns:
            Unexpired entries, newest first
        """
        moment = now if now is not None else utc_now()

        active = []
        for entry in self.pulse_events or []:
            expires_at = entry.get("expires_at")
            if not expires_at:
                continue

            # Stored by us as an ISO string with an offset, so this round-trips
            # aware — unlike the naive DateTime columns elsewhere on this model.
            if datetime.fromisoformat(expires_at) > moment:
                active.append(entry)

        return active

    def record_disconnect(self):
        """
        Stamp the moment this user's last live connection closed.

        Only the LAST connection counts — closing one of several tabs does not
        mean the user left, so the caller decides when this applies.
        """
        self.last_seen = utc_now()

    def returned_after_absence(self, grace_seconds: int = PRESENCE_GRACE_SECONDS) -> bool:
        """
        Whether this reconnection is a genuine return worth announcing.

        A page refresh or a remount drops and remakes the connection within a
        second or two; announcing that to every friend would spam them for a
        thing that never happened. Anyone who has actually been away longer
        than the grace window is treated as arriving.

        A user with no recorded absence (first ever connection, or an
        api-site restart having cleared nothing but memory) counts as
        returning — announcing a real arrival is the safer failure.

        Args:
            grace_seconds: How long an absence must last to count as leaving

        Returns:
            True when friends should be told, False for a blink
        """
        if self.last_seen is None:
            return True

        # Every datetime column on `users` is naive (the table's convention),
        # so a value read back from the database has lost the offset that
        # utc_now() gave it. It is UTC — nothing else ever writes here — so
        # reattaching the timezone is a restatement, not a conversion.
        last_seen = self.last_seen
        if last_seen.tzinfo is None:
            last_seen = last_seen.replace(tzinfo=timezone.utc)

        away_for = utc_now() - last_seen
        return away_for >= timedelta(seconds=grace_seconds)

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

    def set_max_slots(self, max_slots: int):
        """Character capacity knob.

        1-8: at least one slot so an account is never characterless by
        configuration, and never past the slot ceiling baked into the
        characters table. Decreasing does not delete characters — they keep
        their slots and fall out of the visible roster (see the character
        repository's visibility rule).
        """
        if not 1 <= max_slots <= 8:
            raise ValueError("max_slots must be between 1 and 8")
        self.max_slots = max_slots

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
