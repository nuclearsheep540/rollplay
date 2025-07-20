# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from datetime import datetime, timedelta, timezone
import re

def utc_now():
      return datetime.now(timezone.utc)

class UserAggregate:
    """
    User domain aggregate - encapsulates user business rules and invariants.
    
    Business Rules:
    - Email must be valid format and unique
    - Email cannot be changed (immutable after creation)
    - Last login is recorded automatically
    - User creation requires valid email
    """
    def __init__(self, id=None, email=None, created_at=None, last_login=None):
        self.id = id
        self.email = email
        self.created_at = created_at
        self.last_login = last_login
    
    # Email validation regex - RFC 5322 compliant
    _EMAIL_REGEX = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
    
    @classmethod
    def create(cls, email):
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
            created_at=datetime.utcnow()
        )
    
    @classmethod
    def from_persistence(cls, id, email, created_at, last_login=None):
        """
        Reconstruct user from persistence layer.
        
        Args:
            id: User UUID
            email: User email address
            created_at: When user was created
            last_login: Last login timestamp (optional)
            
        Returns:
            UserAggregate: Reconstructed user aggregate
        """
        return cls(
            id=id,
            email=email,
            created_at=created_at,
            last_login=last_login
        )
    
    def record_login(self):
        """
        Business rule: Record user login timestamp.
        
        Updates the last_login field to current UTC time.
        This is the only mutable operation allowed on a user.
        """
        self.last_login = utc_now()
    
    def is_recently_active(self, hours=24):
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
    def _is_valid_email(cls, email):
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
    
    def to_dict(self):
        """
        Serialization helper for API responses.
        
        Returns:
            dict: User data as dictionary
        """
        return {
            'id': str(self.id) if self.id else None,
            'email': self.email,
            'created_at': self.created_at.isoformat(),
            'last_login': self.last_login.isoformat() if self.last_login else None
        }
    
    def __repr__(self):
        return "<UserAggregate {}>".format(self.email)