# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from enum import Enum
from os import environ as env

from pydantic.v1 import BaseSettings


class Environment(Enum):
    "The environment options in which the application can be configured as"
    def __repr__(self):
        return self.value
    
    production = "production"
    prod = production
    staging = "staging"
    dev = "development"
    development = dev


class Settings(BaseSettings):
    """Main application configuration object"""

    # Validates environment value against Environment enum, throws error if invalid
    _env_value: str = env.get("ENVIRONMENT", "development")

    @property
    def environment(self) -> str:
        """Get validated environment value from Environment enum"""
        try:
            # Try to access the enum member by name (e.g., Environment.dev)
            return Environment[self._env_value].value
        except KeyError:
            # If not found by name, try by value (e.g., Environment.development)
            for member in Environment:
                if member.value == self._env_value:
                    return member.value
            # If still not found, raise descriptive error
            valid_values = [f"{m.name} (={m.value})" for m in Environment]
            raise ValueError(
                f"Invalid environment value: '{self._env_value}'. "
                f"Valid options are: {', '.join(valid_values)}"
            )

    # DB - Construct database URLs from individual components
    # This ensures passwords stay in sync when rotated in .env
    _postgres_user: str = env.get("POSTGRES_USER")
    _postgres_password: str = env.get("POSTGRES_PASSWORD")
    _app_db_user: str = "rollplay"  # Application database user (fixed)
    _app_db_password: str = env.get("APP_DB_PASSWORD")
    _postgres_host: str = "postgres"
    _postgres_port: str = "5432"
    _postgres_db: str = env.get("POSTGRES_DB")

    # Validate required database credentials
    if not _postgres_user:
        raise ValueError("POSTGRES_USER environment variable is required")
    if not _postgres_password:
        raise ValueError("POSTGRES_PASSWORD environment variable is required")
    if not _app_db_password:
        raise ValueError("APP_DB_PASSWORD environment variable is required")
    if not _postgres_db:
        raise ValueError("POSTGRES_DB environment variable is required")

    @property
    def database_url(self) -> str:
        """Superuser database connection URL (for migrations, admin tasks)"""
        return f"postgresql://{self._postgres_user}:{self._postgres_password}@{self._postgres_host}:{self._postgres_port}/{self._postgres_db}"

    @property
    def app_database_url(self) -> str:
        """Application database connection URL (limited privileges)"""
        return f"postgresql://{self._app_db_user}:{self._app_db_password}@{self._postgres_host}:{self._postgres_port}/{self._postgres_db}"

    # Backwards compatibility aliases
    DATABASE_URL = property(lambda self: self.database_url)
    APP_DATABASE_URL = property(lambda self: self.app_database_url)

    # JWT
    jwt_secret_key: str = env.get("JWT_SECRET_KEY")
    jwt_algorithm: str = env.get("JWT_ALGORITHM", "HS256")  # Algorithm can have a safe default

    # Validate required JWT configuration
    if not jwt_secret_key:
        raise ValueError("JWT_SECRET_KEY environment variable is required")

    # Logging configuration for dictConfig
    LOGGING_CONFIG = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "default": {
                "()": "uvicorn.logging.DefaultFormatter",
                "fmt": "%(levelprefix)s %(asctime)s | %(message)s",
                "datefmt": "%Y-%m-%d %H:%M:%S",
            }
        },
        "handlers": {
            "default": {
                "formatter": "default",
                "class": "logging.StreamHandler",
                "stream": "ext://sys.stdout",
            }
        },
        "root": {
            "level": "DEBUG",
            "handlers": ["default"]
        }
    }

    class Config:
        case_sensitive = False