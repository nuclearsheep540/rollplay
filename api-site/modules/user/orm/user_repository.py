# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import text
from typing import Optional
from uuid import UUID
import random
import friendlywords as fw

from modules.user.model.user_model import User as UserModel
from modules.user.domain.user_aggregate import UserAggregate

# Preload friendlywords word lists into memory for performance
fw.preload()


class UserRepository:
    """Repository for User aggregate data access with inline ORM conversion."""

    def __init__(self, db_session: Session):
        self.db = db_session

    def _get_friend_code(self, user_id: UUID) -> Optional[str]:
        """Fetch friend code for a user"""
        result = self.db.execute(
            text("SELECT friend_code FROM friend_codes WHERE user_id = :user_id"),
            {"user_id": user_id}
        ).fetchone()
        return result[0] if result else None

    def get_by_id(self, user_id) -> Optional[UserAggregate]:
        """Retrieve user by UUID."""
        model = self.db.query(UserModel).filter_by(id=user_id).first()
        if not model:
            return None

        friend_code = self._ensure_friend_code(model.id)

        return UserAggregate(
            id=model.id,
            email=model.email,
            screen_name=model.screen_name,
            created_at=model.created_at,
            last_login=model.last_login,
            friend_code=friend_code,
            account_name=model.account_name,
            account_tag=model.account_tag
        )

    def get_by_email(self, email: str) -> Optional[UserAggregate]:
        """Retrieve user by email address."""
        normalized_email = email.lower().strip()
        model = self.db.query(UserModel).filter_by(email=normalized_email).first()
        if not model:
            return None

        friend_code = self._ensure_friend_code(model.id)

        return UserAggregate(
            id=model.id,
            email=model.email,
            screen_name=model.screen_name,
            created_at=model.created_at,
            last_login=model.last_login,
            friend_code=friend_code,
            account_name=model.account_name,
            account_tag=model.account_tag
        )

    def _generate_friend_code(self) -> str:
        """
        Generate human-readable friend code using friendlywords.

        Format: predicate-object (e.g., "happy-elephant", "brave-lion")
        Returns lowercase for consistency and case-insensitive lookups.
        """
        return fw.generate('po', separator='-').lower()

    def _ensure_friend_code(self, user_id: UUID):
        """Ensure user has a friend code, generate if missing"""
        existing = self._get_friend_code(user_id)
        if existing:
            return existing

        # Generate unique friend code
        max_attempts = 10
        for attempt in range(max_attempts):
            friend_code = self._generate_friend_code()

            # Check if code already exists
            result = self.db.execute(
                text("SELECT 1 FROM friend_codes WHERE friend_code = :code"),
                {"code": friend_code}
            ).fetchone()

            if not result:
                # Code is unique, insert it
                self.db.execute(
                    text("INSERT INTO friend_codes (user_id, friend_code) VALUES (:user_id, :code)"),
                    {"user_id": user_id, "code": friend_code}
                )
                self.db.commit()
                return friend_code

        raise RuntimeError(f"Failed to generate unique friend code for user {user_id}")

    def get_by_friend_code(self, friend_code: str) -> Optional[UserAggregate]:
        """Retrieve user by friend code (case-insensitive). DEPRECATED - use get_by_account_identifier."""
        code_upper = friend_code.upper().strip()
        result = self.db.execute(
            text("SELECT user_id FROM friend_codes WHERE UPPER(friend_code) = UPPER(:code)"),
            {"code": code_upper}
        ).fetchone()

        if not result:
            return None

        return self.get_by_id(result[0])

    # ============================================
    # ACCOUNT TAG METHODS (New System)
    # ============================================

    def get_by_account_identifier(self, identifier: str) -> Optional[UserAggregate]:
        """
        Retrieve user by account identifier (e.g., "claude#2345").

        Case-insensitive on account_name, exact match on tag.

        Args:
            identifier: Full identifier in "name#tag" format

        Returns:
            UserAggregate if found, None otherwise
        """
        if '#' not in identifier:
            return None

        parts = identifier.split('#', 1)
        if len(parts) != 2:
            return None

        account_name = parts[0].strip()
        account_tag = parts[1].strip()

        if not account_name or not account_tag:
            return None

        # Query with case-insensitive name match
        model = self.db.query(UserModel).filter(
            UserModel.account_name.ilike(account_name),
            UserModel.account_tag == account_tag
        ).first()

        if not model:
            return None

        friend_code = self._ensure_friend_code(model.id)

        return UserAggregate(
            id=model.id,
            email=model.email,
            screen_name=model.screen_name,
            created_at=model.created_at,
            last_login=model.last_login,
            friend_code=friend_code,
            account_name=model.account_name,
            account_tag=model.account_tag
        )

    def generate_unique_tag(self, account_name: str) -> str:
        """
        Generate a unique 4-digit tag for the given account_name.

        Checks existing tags for this account_name and generates a new random
        one that doesn't conflict.

        Args:
            account_name: The account name to generate a tag for

        Returns:
            A unique 4-digit tag string (e.g., "2345")

        Raises:
            RuntimeError: If unable to generate unique tag after max attempts
        """
        max_attempts = 100  # Should be plenty for 10,000 possible tags

        for _ in range(max_attempts):
            # Generate random 4-digit tag (0000-9999)
            tag = f"{random.randint(0, 9999):04d}"

            # Check if this tag already exists for this account_name
            existing = self.db.query(UserModel).filter(
                UserModel.account_name.ilike(account_name),
                UserModel.account_tag == tag
            ).first()

            if not existing:
                return tag

        raise RuntimeError(
            f"Failed to generate unique tag for account_name '{account_name}'. "
            "This name may have too many existing users."
        )

    def account_identifier_exists(self, account_name: str, account_tag: str) -> bool:
        """
        Check if an account_name + tag combination already exists.

        Case-insensitive on account_name.

        Args:
            account_name: Account name to check
            account_tag: 4-digit tag to check

        Returns:
            True if the combination exists, False otherwise
        """
        existing = self.db.query(UserModel).filter(
            UserModel.account_name.ilike(account_name),
            UserModel.account_tag == account_tag
        ).first()
        return existing is not None

    def save(self, aggregate: UserAggregate):
        """Save user aggregate to database."""
        try:
            if aggregate.id:
                # Update existing user
                model = self.db.query(UserModel).filter_by(id=aggregate.id).first()
                if not model:
                    raise ValueError(f"User {aggregate.id} not found for update")

                model.email = aggregate.email
                model.screen_name = aggregate.screen_name
                model.last_login = aggregate.last_login
                # Update account_name and account_tag if set on aggregate
                if aggregate.account_name is not None:
                    model.account_name = aggregate.account_name
                if aggregate.account_tag is not None:
                    model.account_tag = aggregate.account_tag
            else:
                # Create new user
                model = UserModel(
                    email=aggregate.email,
                    screen_name=aggregate.screen_name,
                    created_at=aggregate.created_at,
                    last_login=aggregate.last_login,
                    account_name=aggregate.account_name,
                    account_tag=aggregate.account_tag
                )
                self.db.add(model)

            self.db.commit()
            self.db.refresh(model)

            # Update aggregate with persisted ID if it was new
            if not aggregate.id:
                aggregate.id = model.id

            # Ensure friend code exists for this user (DEPRECATED - keeping for backward compatibility)
            friend_code = self._ensure_friend_code(model.id)
            aggregate.friend_code = friend_code

        except IntegrityError as e:
            self.db.rollback()
            if "email" in str(e):
                raise ValueError(f"Email {aggregate.email} is already registered")
            if "account_name" in str(e) or "uq_users_account_name_tag" in str(e):
                raise ValueError(f"Account identifier already exists")
            raise RuntimeError(f"Database integrity error: {e}")
        except Exception as e:
            self.db.rollback()
            raise RuntimeError(f"Failed to save user: {e}")
