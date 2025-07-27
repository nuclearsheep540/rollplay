# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from user.orm.user_model import User as UserModel
from user.domain.aggregates import UserAggregate

def to_domain(model):
    """
    Convert ORM model to domain aggregate.
    
    This function handles the translation from the data layer (SQLAlchemy model)
    to the domain layer (UserAggregate). This ensures the domain layer remains
    pure and doesn't depend on infrastructure concerns.
    
    Args:
        model: SQLAlchemy User model from database
        
    Returns:
        UserAggregate: Domain representation of the user
        
    Raises:
        AttributeError: If required fields are missing from model
    """
    if not model:
        raise ValueError("Cannot convert None model to domain aggregate")
        
    return UserAggregate(
        id=model.id,
        email=model.email,
        screen_name=model.screen_name,
        created_at=model.created_at,
        last_login=model.last_login
    )

def from_domain(aggregate):
    """
    Convert domain aggregate to ORM model.
    
    This function handles the translation from the domain layer (UserAggregate)
    to the data layer (SQLAlchemy model). Used when creating new records.
    
    Args:
        aggregate: UserAggregate from domain layer
        
    Returns:
        UserModel: SQLAlchemy model ready for persistence
        
    Raises:
        AttributeError: If required fields are missing from aggregate
    """
    if not aggregate:
        raise ValueError("Cannot convert None aggregate to model")
        
    return UserModel(
        id=aggregate.id,
        email=aggregate.email,
        screen_name=aggregate.screen_name,
        created_at=aggregate.created_at,
        last_login=aggregate.last_login
    )

def update_model_from_domain(model, aggregate):
    """
    Update existing ORM model from domain aggregate.
    
    This function updates an existing SQLAlchemy model with values from
    a domain aggregate. Used for update operations where we want to preserve
    the existing model instance.
    
    Args:
        model: Existing SQLAlchemy User model
        aggregate: UserAggregate with updated values
        
    Raises:
        ValueError: If model or aggregate is None
    """
    if not model:
        raise ValueError("Cannot update None model")
    if not aggregate:
        raise ValueError("Cannot update from None aggregate")
        
    # Update mutable fields only
    # Note: id and created_at are immutable, email is immutable after creation
    model.last_login = aggregate.last_login
    model.screen_name = aggregate.screen_name
    
    # Email should not change after creation (business rule)
    # If this changes, it indicates a business rule violation
    if model.email != aggregate.email:
        raise ValueError(
            "Email cannot be changed after user creation. "
            "Existing: {}, Attempted: {}".format(model.email, aggregate.email)
        )