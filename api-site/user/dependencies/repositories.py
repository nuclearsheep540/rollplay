# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import Depends
from sqlalchemy.orm import Session
from shared.db import get_db
from user.repositories.user_repository import UserRepository

# Dependencies we want FAST to inject in endpoints
def user_repository(db: Session = Depends(get_db)) -> UserRepository:
    return UserRepository(db)
