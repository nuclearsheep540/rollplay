# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import Depends
from sqlalchemy.orm import Session

from shared.dependencies.db import get_db
from modules.friendship.repositories.friendship_repository import FriendshipRepository
from modules.friendship.repositories.friend_request_repository import FriendRequestRepository


def get_friendship_repository(db: Session = Depends(get_db)) -> FriendshipRepository:
    """Dependency injection for FriendshipRepository"""
    return FriendshipRepository(db)


def get_friend_request_repository(db: Session = Depends(get_db)) -> FriendRequestRepository:
    """Dependency injection for FriendRequestRepository"""
    return FriendRequestRepository(db)
