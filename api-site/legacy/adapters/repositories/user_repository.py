# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from orm.user_model import User as UserModel
from domain.aggregates.user_aggregate import UserAggregate
from adapters.mappers.user_mapper import to_domain, from_domain, update_model_from_domain

class UserRepository:
    """
    Repository for User aggregate data access.
    
    This class abstracts all database operations for the User aggregate,
    using the UserMapper to convert between domain and data layers.
    
    Responsibilities:
    - Provide clean interface for user data access
    - Handle database sessions and transactions
    - Convert between domain aggregates and ORM models
    - Enforce database constraints and handle errors
    """
    
    def __init__(self, db_session):
        """
        Initialize repository with database session.
        
        Args:
            db_session: SQLAlchemy database session
        """
        self.db = db_session
    
    def get_by_id(self, user_id):
        """
        Retrieve user by UUID.
        
        Args:
            user_id: User UUID to search for
            
        Returns:
            UserAggregate: User if found, None otherwise
        """
        model = self.db.query(UserModel).filter_by(id=user_id).first()
        if not model:
            return None
        return to_domain(model)
    
    def get_by_email(self, email):
        """
        Retrieve user by email address.
        
        Email lookup is case-insensitive and trimmed.
        
        Args:
            email: Email address to search for
            
        Returns:
            UserAggregate: User if found, None otherwise
        """
        normalized_email = email.lower().strip()
        model = self.db.query(UserModel).filter_by(email=normalized_email).first()
        if not model:
            return None
        return to_domain(model)
    
    def save(self, aggregate):
        """
        Save user aggregate to database.
        
        Handles both create and update operations based on whether
        the aggregate has an ID.
        
        Args:
            aggregate: UserAggregate to save
            
        Returns:
            UUID: The user's ID (assigned if new)
            
        Raises:
            ValueError: If email is already taken (for new users)
            RuntimeError: If database operation fails
        """
        try:
            if aggregate.id:
                # Update existing user
                model = self.db.query(UserModel).filter_by(id=aggregate.id).first()
                if not model:
                    raise ValueError("User {} not found for update".format(aggregate.id))
                
                update_model_from_domain(model, aggregate)
            else:
                # Create new user
                model = from_domain(aggregate)
                self.db.add(model)
            
            self.db.commit()
            self.db.refresh(model)
            
            # Update aggregate with persisted ID if it was new
            if not aggregate.id:
                aggregate.id = model.id
                
            return model.id
            
        except IntegrityError as e:
            self.db.rollback()
            if "email" in str(e):
                raise ValueError("Email {} is already registered".format(aggregate.email))
            raise RuntimeError("Database integrity error: {}".format(e))
        except Exception as e:
            self.db.rollback()
            raise RuntimeError("Failed to save user: {}".format(e))
    
    def exists_by_email(self, email):
        """
        Check if user exists by email without loading full aggregate.
        
        More efficient than get_by_email when you only need to check existence.
        
        Args:
            email: Email address to check
            
        Returns:
            bool: True if user exists with this email
        """
        normalized_email = email.lower().strip()
        count = self.db.query(UserModel).filter_by(email=normalized_email).count()
        return count > 0
    
    def delete(self, user_id):
        """
        Delete user by ID.
        
        Note: Consider implementing soft delete if user data needs to be preserved
        for audit trails or referential integrity.
        
        Args:
            user_id: UUID of user to delete
            
        Returns:
            bool: True if user was deleted, False if not found
            
        Raises:
            RuntimeError: If database operation fails
        """
        try:
            model = self.db.query(UserModel).filter_by(id=user_id).first()
            if not model:
                return False
                
            self.db.delete(model)
            self.db.commit()
            return True
            
        except Exception as e:
            self.db.rollback()
            raise RuntimeError("Failed to delete user {}: {}".format(user_id, e))
    
    def get_recently_active_users(self, hours=24, limit=100):
        """
        Get users who have logged in recently.
        
        Args:
            hours: Number of hours to consider as "recent" (default 24)
            limit: Maximum number of users to return (default 100)
            
        Returns:
            list[UserAggregate]: List of recently active users
        """
        from datetime import datetime, timedelta
        
        time_threshold = datetime.utcnow() - timedelta(hours=hours)
        models = (
            self.db.query(UserModel)
            .filter(UserModel.last_login > time_threshold)
            .order_by(UserModel.last_login.desc())
            .limit(limit)
            .all()
        )
        
        return [to_domain(model) for model in models]