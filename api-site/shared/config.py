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
    _env_value: str = env.get("environment", "development")

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

    # DB
    app_database_url: str = env.get(
        "APP_DATABASE_URL",
        "postgresql://postgres:postgres@postgres:5432/rollplay"
    )
    APP_DATABASE_URL = app_database_url  # Backwards compatibility

    # JWT
    jwt_secret_key: str = env.get("JWT_SECRET_KEY", "your-secret-key")
    jwt_algorithm: str = env.get("JWT_ALGORITHM", "HS256")

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