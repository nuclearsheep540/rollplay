# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from shared.config import Settings

# Initialize settings
settings = Settings()

# Database engine and base
connection_url = settings.APP_DATABASE_URL
engine = create_engine(connection_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def configure_mappers():
    """
    Import all ORM models and configure SQLAlchemy mappers.
    This ensures all models are registered with SQLAlchemy's mapper registry.
    """
    # Import all ORM models to register them with SQLAlchemy
    from modules.user.model.user_model import User
    from modules.characters.model.character_model import Character
    from modules.campaign.model.campaign_model import Campaign
    from modules.campaign.model.game_model import Game
    from modules.friendship.model.friendship_model import FriendshipModel
    from modules.friendship.model.friend_request_model import FriendRequestModel
    # Import any other models from other aggregates

    # Configure the registry
    Base.registry.configure()

def get_db():
    """Dependency to get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()