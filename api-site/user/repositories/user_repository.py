# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import Optional

from user.orm.user_model import User as UserModel
from user.domain.aggregates import UserAggregate


class UserRepository:
    """Repository for User aggregate data access with inline ORM conversion."""

    def __init__(self, db_session: Session):
        self.db = db_session

    def get_by_id(self, user_id) -> Optional[UserAggregate]:
        """Retrieve user by UUID."""
        model = self.db.query(UserModel).filter_by(id=user_id).first()
        if not model:
            return None

        return UserAggregate(
            id=model.id,
            email=model.email,
            screen_name=model.screen_name,
            created_at=model.created_at,
            last_login=model.last_login
        )

    def get_by_email(self, email: str) -> Optional[UserAggregate]:
        """Retrieve user by email address."""
        normalized_email = email.lower().strip()
        model = self.db.query(UserModel).filter_by(email=normalized_email).first()
        if not model:
            return None

        return UserAggregate(
            id=model.id,
            email=model.email,
            screen_name=model.screen_name,
            created_at=model.created_at,
            last_login=model.last_login
        )

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

        except IntegrityError as e:
            self.db.rollback()
            if "email" in str(e):
                raise ValueError(f"Email {aggregate.email} is already registered")
            raise RuntimeError(f"Database integrity error: {e}")
        except Exception as e:
            self.db.rollback()
            raise RuntimeError(f"Failed to save user: {e}")
