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


class UserNotFoundError(Exception):
    """Raised when a command targets a user id that doesn't resolve.

    Distinct from ValueError (domain validation, e.g. a bad color or screen
    name) so endpoints can map missing-user to 404 instead of a misleading
    400 — the library module's PresetNotFoundError precedent.
    """


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
            raise UserNotFoundError(f"User {user_id} not found")

        # Business logic in aggregate
        user.update_screen_name(screen_name)
        self.repository.save(user)
        return user


class UpdateUserColor:
    def __init__(self, repository: UserRepository):
        self.repository = repository

    def execute(self, user_id: UUID, color: str) -> UserAggregate:
        """Set the user's identity color (validated against USER_COLORS in the aggregate)."""
        user = self.repository.get_by_id(user_id)
        if not user:
            raise UserNotFoundError(f"User {user_id} not found")

        user.set_color(color)
        self.repository.save(user)
        return user


class SetMaxSlots:
    """Admin knob: change a user's character capacity (1-8).

    Decreasing capacity hides characters in slots at or above the new limit —
    rows are untouched and reappear if capacity is raised again — and ejects
    those characters from any campaign they are locked to. The user keeps
    campaign membership; only the character leaves, and the player can free a
    visible slot and re-select later.

    Refused outright while any affected campaign has a live session: ejecting
    a character out of a running game would corrupt the table mid-play.
    """

    def __init__(self, user_repository: UserRepository, character_repository, session_repository):
        self.user_repo = user_repository
        self.character_repo = character_repository
        self.session_repo = session_repository

    def execute(self, *, user_id: UUID, max_slots: int) -> UserAggregate:
        user = self.user_repo.get_by_id(user_id)
        if not user:
            raise UserNotFoundError(f"User {user_id} not found")

        user.set_max_slots(max_slots)

        hidden_characters = self.character_repo.get_by_slot_at_or_above(user_id, max_slots)
        locked = [c for c in hidden_characters if c.active_campaign is not None]

        # All-or-nothing: check every affected campaign before ejecting any.
        for character in locked:
            if self.session_repo.get_active_session_for_campaign(character.active_campaign):
                raise ValueError(
                    f"Cannot reduce slots: character '{character.character_name}' is in a "
                    f"campaign with a live session. Try again when the table is quiet."
                )

        for character in locked:
            character.unlock_from_campaign()
            self.character_repo.save(character)
            logger.info(
                f"SetMaxSlots: ejected character {character.id} from campaign "
                f"(slot {character.slot} >= new max {max_slots})"
            )

        self.user_repo.save(user)
        logger.info(f"SetMaxSlots: user {user_id} capacity set to {max_slots}")
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
