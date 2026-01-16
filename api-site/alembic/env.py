# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

import os
import sys

# Add the project root to the path so we can import our models
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + '/..')

# Import your models here - using new DDD structure
from shared.dependencies.db import Base

# Import all models to ensure they're registered with SQLAlchemy
try:
    from modules.user.model.user_model import User
    from modules.user.model.friend_code_model import FriendCode
    from modules.characters.model.character_model import Character
    from modules.campaign.model.campaign_model import Campaign
    from modules.campaign.model.game_model import Game
    from modules.friendship.model.friend_request_model import FriendRequestModel
    from modules.friendship.model.friendship_model import FriendshipModel
    print("Models imported successfully")
except ImportError as e:
    print(f"Error importing models: {e}")
    # Fallback - just import Base for now
    pass

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.

def get_url():
    """Get database URL from environment variables - construct from components"""
    app_db_user = os.getenv("APP_DB_USER")
    app_db_password = os.getenv("APP_DB_PASSWORD")
    postgres_host = os.getenv("POSTGRES_HOST")
    postgres_port = os.getenv("POSTGRES_PORT")
    postgres_db = os.getenv("POSTGRES_DB")

    if not app_db_user:
        raise ValueError("APP_DB_USER environment variable is required")
    if not app_db_password:
        raise ValueError("APP_DB_PASSWORD environment variable is required")
    if not postgres_host:
        raise ValueError("POSTGRES_HOST environment variable is required")
    if not postgres_port:
        raise ValueError("POSTGRES_PORT environment variable is required")
    if not postgres_db:
        raise ValueError("POSTGRES_DB environment variable is required")

    return f"postgresql://{app_db_user}:{app_db_password}@{postgres_host}:{postgres_port}/{postgres_db}"

def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    configuration = config.get_section(config.config_ini_section)
    configuration["sqlalchemy.url"] = get_url()
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()