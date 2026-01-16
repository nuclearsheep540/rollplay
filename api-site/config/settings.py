# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from enum import Enum

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(str, Enum):
    """The environment options in which the application can be configured as"""
    production = "production"
    prod = "production"
    staging = "staging"
    development = "development"
    dev = "development"


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.

    Pydantic BaseSettings automatically reads env vars matching field names.
    Required fields (no default) will cause startup failure if not set.
    """

    model_config = SettingsConfigDict(
        env_file='.env',
        env_file_encoding='utf-8',
        extra='ignore'
    )

    # Environment
    ENVIRONMENT: Environment = Field(
        default=Environment.development,
        description="Read from ENVIRONMENT env var, defaults to 'development' if not set"
    )

    # PostgreSQL - required, no defaults
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_HOST: str
    POSTGRES_PORT: str
    POSTGRES_DB: str

    # Application DB credentials
    APP_DB_USER: str
    APP_DB_PASSWORD: str

    # JWT - required
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"

    @property
    def database_url(self) -> str:
        """Superuser database connection URL (for migrations, admin tasks)"""
        return f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    @property
    def app_database_url(self) -> str:
        """Application database connection URL (limited privileges)"""
        return f"postgresql://{self.APP_DB_USER}:{self.APP_DB_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    # Backwards compatibility aliases
    DATABASE_URL = property(lambda self: self.database_url)
    APP_DATABASE_URL = property(lambda self: self.app_database_url)

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
