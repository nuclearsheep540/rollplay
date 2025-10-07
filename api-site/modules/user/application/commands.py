# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import Tuple
from modules.user.repositories.user_repository import UserRepository
from modules.user.domain.user_aggregate import UserAggregate


class GetOrCreateUser:
    def __init__(self, repository: UserRepository):
        self.repository = repository

    def execute(self, email: str) -> Tuple[UserAggregate, bool]:
        """Get existing user or create new one"""
        user = self.repository.get_by_email(email)
        if user:
            return user, False

        # Create new user through aggregate
        new_user = UserAggregate.create(email)
        self.repository.save(new_user)
        return new_user


class UpdateScreenName:
    def __init__(self, repository: UserRepository):
        self.repository = repository

    def execute(self, user_id: str, screen_name: str) -> UserAggregate:
        """Update user screen name with business rule validation"""
        user = self.repository.get_by_id(user_id)
        if not user:
            raise ValueError(f"User {user_id} not found")

        # Business logic in aggregate
        user.update_screen_name(screen_name)
        self.repository.save(user)
        return user
