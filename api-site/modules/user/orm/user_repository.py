# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import text
from typing import Optional
from uuid import UUID
from datetime import datetime, timezone
import random

from modules.user.model.user_model import User as UserModel
from modules.user.domain.user_aggregate import UserAggregate


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

    def get_by_id(self, user_id, include_deleted: bool = False) -> Optional[UserAggregate]:
        """Retrieve user by UUID. Excludes soft-deleted users by default."""
        query = self.db.query(UserModel).filter_by(id=user_id)
        if not include_deleted:
            query = query.filter(UserModel.is_deleted == False)
        model = query.first()
        if not model:
            return None

        friend_code = self._get_existing_friend_code(model.id)

        return UserAggregate(
            id=model.id,
            email=model.email,
            screen_name=model.screen_name,
            created_at=model.created_at,
            last_login=model.last_login,
            friend_code=friend_code,
            account_name=model.account_name,
            account_tag=model.account_tag,
            has_received_demo=model.has_received_demo
        )

    def get_by_email(self, email: str, include_deleted: bool = False) -> Optional[UserAggregate]:
        """Retrieve user by email address. Excludes soft-deleted users by default."""
        normalized_email = email.lower().strip()
        query = self.db.query(UserModel).filter_by(email=normalized_email)
        if not include_deleted:
            query = query.filter(UserModel.is_deleted == False)
        model = query.first()
        if not model:
            return None

        friend_code = self._get_existing_friend_code(model.id)

        return UserAggregate(
            id=model.id,
            email=model.email,
            screen_name=model.screen_name,
            created_at=model.created_at,
            last_login=model.last_login,
            friend_code=friend_code,
            account_name=model.account_name,
            account_tag=model.account_tag,
            has_received_demo=model.has_received_demo
        )

    def _get_existing_friend_code(self, user_id: UUID) -> Optional[str]:
        """
        Get existing friend code for a user (DEPRECATED - no longer generates new codes).

        Friend codes have been superseded by account tags. This method only
        returns existing codes for backward compatibility.
        """
        return self._get_friend_code(user_id)

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

        # Query with case-insensitive name match, exclude deleted
        model = self.db.query(UserModel).filter(
            UserModel.account_name.ilike(account_name),
            UserModel.account_tag == account_tag,
            UserModel.is_deleted == False
        ).first()

        if not model:
            return None

        friend_code = self._get_existing_friend_code(model.id)

        return UserAggregate(
            id=model.id,
            email=model.email,
            screen_name=model.screen_name,
            created_at=model.created_at,
            last_login=model.last_login,
            friend_code=friend_code,
            account_name=model.account_name,
            account_tag=model.account_tag,
            has_received_demo=model.has_received_demo
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
                model.has_received_demo = aggregate.has_received_demo
                # Update account_name and account_tag if set on aggregate
                if aggregate.account_name is not None:
                    model.account_name = aggregate.account_name
                if aggregate.account_tag is not None:
                    model.account_tag = aggregate.account_tag
            else:
                # Create new user - pre-generate account_tag for better UX
                # User will see their final tag (e.g., "????#2345") before choosing username
                account_tag = None
                if aggregate.account_tag is None:
                    # Generate a random tag that's not tied to any account_name yet
                    # This will be used later when user sets their account_name
                    account_tag = f"{random.randint(0, 9999):04d}"
                    aggregate.account_tag = account_tag

                model = UserModel(
                    email=aggregate.email,
                    screen_name=aggregate.screen_name,
                    created_at=aggregate.created_at,
                    last_login=aggregate.last_login,
                    account_name=aggregate.account_name,
                    account_tag=aggregate.account_tag,
                    has_received_demo=aggregate.has_received_demo
                )
                self.db.add(model)

            self.db.commit()
            self.db.refresh(model)

            # Update aggregate with persisted ID if it was new
            if not aggregate.id:
                aggregate.id = model.id

            # Ensure friend code exists for this user (DEPRECATED - keeping for backward compatibility)
            friend_code = self._get_existing_friend_code(model.id)
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

    def delete(self, user_id: UUID) -> bool:
        """
        Delete a user by ID with full cascade of all associated data.

        This is a hard delete - use for development/testing only.
        In production, use soft_delete instead.

        Cascades deletion of:
        - Characters owned by user
        - Sessions hosted by user
        - Campaigns hosted by user
        - Friend codes (has DB cascade but explicit for clarity)
        - Other tables with CASCADE already set: friendships, friend_requests,
          notifications, session_joined_users

        Returns:
            True if user was deleted, False if not found
        """
        model = self.db.query(UserModel).filter_by(id=user_id).first()
        if not model:
            return False

        # Delete in order of dependencies (children before parents)

        # 1. Delete characters owned by user (no DB cascade)
        self.db.execute(
            text("DELETE FROM characters WHERE user_id = :user_id"),
            {"user_id": user_id}
        )

        # 2. Delete sessions hosted by user (no DB cascade)
        # Note: session_joined_users has CASCADE on session_id, so those rows
        # will be auto-deleted when sessions are deleted
        self.db.execute(
            text("DELETE FROM sessions WHERE host_id = :user_id"),
            {"user_id": user_id}
        )

        # 3. Delete campaigns hosted by user (no DB cascade)
        self.db.execute(
            text("DELETE FROM campaigns WHERE host_id = :user_id"),
            {"user_id": user_id}
        )

        # 4. Delete friend code (has DB cascade but explicit for clarity)
        self.db.execute(
            text("DELETE FROM friend_codes WHERE user_id = :user_id"),
            {"user_id": user_id}
        )

        # Tables with DB-level CASCADE (auto-deleted, listed for documentation):
        # - friendships (user1_id, user2_id)
        # - friend_requests (requester_id, recipient_id)
        # - notifications (user_id)
        # - session_joined_users (user_id)

        # Finally delete the user
        self.db.delete(model)
        self.db.commit()
        return True

    def soft_delete(self, user_id: UUID) -> bool:
        """
        Soft delete a user by ID.

        Sets is_deleted=True and deleted_at timestamp.
        User data is preserved but user won't appear in queries.

        Returns:
            True if user was soft deleted, False if not found
        """
        model = self.db.query(UserModel).filter_by(id=user_id).first()
        if not model:
            return False

        model.is_deleted = True
        model.deleted_at = datetime.now(timezone.utc)
        self.db.commit()
        return True
