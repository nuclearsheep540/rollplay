# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import Tuple
from uuid import UUID
from modules.user.orm.user_repository import UserRepository
from modules.user.domain.user_aggregate import UserAggregate


class GetOrCreateUser:
    """Get existing user or create new one."""

    def __init__(self, repository: UserRepository):
        self.repository = repository

    def execute(self, email: str) -> Tuple[UserAggregate, bool]:
        """
        Get existing user or create new one.

        Demo campaigns are created lazily when user first views their campaign list.

        Returns:
            Tuple of (user, created) where created is True if new user was created
        """
        user = self.repository.get_by_email(email)
        if user:
            return user, False

        # Create new user through aggregate
        new_user = UserAggregate.create(email)
        self.repository.save(new_user)

        return new_user, True


class UpdateScreenName:
    def __init__(self, repository: UserRepository):
        self.repository = repository

    def execute(self, user_id: UUID, screen_name: str) -> UserAggregate:
        """Update user screen name with business rule validation"""
        user = self.repository.get_by_id(user_id)
        if not user:
            raise ValueError(f"User {user_id} not found")

        # Business logic in aggregate
        user.update_screen_name(screen_name)
        self.repository.save(user)
        return user


class SoftDeleteUser:
    """Soft delete a user account. For production use."""

    def __init__(self, repository: UserRepository):
        self.repository = repository

    def execute(self, user_id: UUID) -> bool:
        """
        Soft delete user account - marks as deleted but preserves data.

        Args:
            user_id: UUID of user to delete

        Returns:
            True if deleted, False if not found
        """
        return self.repository.soft_delete(user_id)


class HardDeleteUser:
    """Hard delete a user account. For development/testing use only."""

    def __init__(self, repository: UserRepository):
        self.repository = repository

    def execute(self, user_id: UUID) -> bool:
        """
        Permanently delete user account and all associated data.

        WARNING: This is irreversible. Use SoftDeleteUser for production.

        Args:
            user_id: UUID of user to delete

        Returns:
            True if deleted, False if not found
        """
        return self.repository.delete(user_id)
