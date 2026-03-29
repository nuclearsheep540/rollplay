# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import logging
from typing import Tuple
from uuid import UUID
from modules.user.repositories.user_repository import UserRepository
from modules.user.domain.user_aggregate import UserAggregate
from modules.library.repositories.asset_repository import MediaAssetRepository
from shared.services.s3_service import S3Service

logger = logging.getLogger(__name__)


class GetOrCreateUser:
    """Get existing user or create new one."""

    def __init__(self, repository: UserRepository):
        self.repository = repository

    def execute(self, email: str) -> Tuple[UserAggregate, bool]:
        """
        Get existing user or create new one.

        If a soft-deleted user exists with this email, reactivate the account
        instead of creating a new one (avoids unique constraint violation).

        Demo campaigns are created lazily when user first views their campaign list.

        Returns:
            Tuple of (user, is_new) where is_new is True if the user was newly
            created or reactivated from a soft-deleted state (needs onboarding).
        """
        # Check for active user first
        user = self.repository.get_by_email(email)
        if user:
            return user, False

        # Check for soft-deleted user with this email
        deleted_user = self.repository.get_by_email(email, include_deleted=True)
        if deleted_user:
            deleted_user.reactivate()
            self.repository.reactivate(deleted_user)
            return deleted_user, True

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
    """
    Soft delete a user account with full cascade cleanup.

    Deletes all associated data (campaigns, characters, assets, friendships, etc.)
    so the user gets a clean slate if they re-register with the same email.
    Media assets are also removed from S3.
    """

    def __init__(self, repository: UserRepository, asset_repository: MediaAssetRepository, s3_service: S3Service):
        self.repository = repository
        self.asset_repository = asset_repository
        self.s3_service = s3_service

    def execute(self, user_id: UUID) -> bool:
        """
        Soft delete user account with full data cleanup.

        1. Deletes all media assets from S3
        2. Cascade-deletes all related DB data
        3. Marks user as soft-deleted

        Args:
            user_id: UUID of user to delete

        Returns:
            True if deleted, False if not found
        """
        # Step 1: Delete media assets from S3 (cross-service concern)
        assets = self.asset_repository.get_by_user_id(user_id)
        for asset in assets:
            try:
                self.s3_service.delete_object(asset.s3_key)
            except Exception as e:
                logger.warning(f"Failed to delete S3 object {asset.s3_key} for user {user_id}: {e}")

        # Step 2: Cascade-delete all DB data and mark user as soft-deleted
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
