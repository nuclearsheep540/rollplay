# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import text
from typing import Optional
from uuid import UUID
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
            friend_code=friend_code
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
            friend_code=friend_code
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
        """Retrieve user by friend code (case-insensitive)"""
        code_upper = friend_code.upper().strip()
        result = self.db.execute(
            text("SELECT user_id FROM friend_codes WHERE UPPER(friend_code) = UPPER(:code)"),
            {"code": code_upper}
        ).fetchone()

        if not result:
            return None

        return self.get_by_id(result[0])

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
            else:
                # Create new user
                model = UserModel(
                    email=aggregate.email,
                    screen_name=aggregate.screen_name,
                    created_at=aggregate.created_at,
                    last_login=aggregate.last_login
                )
                self.db.add(model)

            self.db.commit()
            self.db.refresh(model)

            # Update aggregate with persisted ID if it was new
            if not aggregate.id:
                aggregate.id = model.id

            # Ensure friend code exists for this user
            friend_code = self._ensure_friend_code(model.id)
            aggregate.friend_code = friend_code

        except IntegrityError as e:
            self.db.rollback()
            if "email" in str(e):
                raise ValueError(f"Email {aggregate.email} is already registered")
            raise RuntimeError(f"Database integrity error: {e}")
        except Exception as e:
            self.db.rollback()
            raise RuntimeError(f"Failed to save user: {e}")
