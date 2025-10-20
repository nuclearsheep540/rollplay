# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import Depends
from sqlalchemy.orm import Session
from shared.dependencies.db import get_db
from modules.user.orm.user_repository import UserRepository

# Dependencies we want FAST to inject in endpoints
def user_repository(db: Session = Depends(get_db)) -> UserRepository:
    return UserRepository(db)
