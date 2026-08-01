# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import os
from enum import Enum
from typing import ClassVar, Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(str, Enum):
    """The environment options in which the application can be configured as"""
    production = "production"
    development = "development"


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

    # PostgreSQL
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_HOST: str
    POSTGRES_PORT: str
    POSTGRES_DB: str

    # Application database credentials (limited privileges)
    APP_DB_USER: str
    APP_DB_PASSWORD: str

    # JWT - required
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"

    # AWS S3 Configuration
    AWS_ACCESS_KEY_ID: str = Field(..., description="AWS access key for S3 asset storage")
    AWS_SECRET_ACCESS_KEY: str = Field(..., description="AWS secret key for S3 asset storage")
    AWS_REGION: str = Field(default="eu-west-1", description="AWS region for S3 bucket")
    S3_BUCKET_NAME: str = Field(..., description="S3 bucket name for asset storage")
    PRESIGNED_URL_EXPIRY: int = Field(default=3600, description="Presigned URL expiry in seconds")
    EXPIRED_SESSION_CLEANUP_INTERVAL: int = Field(default=60, description="Seconds between cleanup passes that auto-pause ACTIVE sessions past their signed-URL lease")

    # CloudFront signed-URL delivery (optional — when unset, downloads fall back to presigned S3)
    AWS_CFD_S3_URL: Optional[str] = Field(default=None, description="CloudFront distribution domain, no scheme (e.g. d123.cloudfront.net)")
    CFD_PEM_FILENAME: Optional[str] = Field(default=None, description="Filename of the CloudFront signing private key, mounted at ~/.ssh/<file>")
    CFD_KEY_PAIR_ID: Optional[str] = Field(default=None, description="CloudFront public key ID (the K… value) used as Key-Pair-Id in signed URLs")

    # Spotify integration (OAuth Authorization Code flow). Optional so the app boots
    # without them; the Spotify client 503-guards when any are unset.
    SPOTIFY_CLIENT_ID: Optional[str] = Field(default=None, description="Spotify app client ID")
    SPOTIFY_CLIENT_SECRET: Optional[str] = Field(default=None, description="Spotify app client secret")
    SPOTIFY_REDIRECT_URI: Optional[str] = Field(default=None, description="Registered Spotify redirect URI — must match the dashboard exactly")

    @property
    def is_production(self) -> bool:
        """True when running as production."""
        return self.ENVIRONMENT is Environment.production

    @property
    def cfd_private_key_path(self) -> Optional[str]:
        """Absolute path to the mounted CloudFront signing key, or None if not configured."""
        if not self.CFD_PEM_FILENAME:
            return None
        return os.path.expanduser(f"~/.ssh/{self.CFD_PEM_FILENAME}")

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

    # Logging configuration for dictConfig (ClassVar = not a settings field)
    LOGGING_CONFIG: ClassVar[dict] = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "default": {
                "()": "uvicorn.logging.DefaultFormatter",
                "fmt": "%(levelprefix)s %(asctime)s | %(message)s",
                "datefmt": "%Y-%m-%d %H:%M:%S",
            },
            "access": {
                "()": "uvicorn.logging.AccessFormatter",
                "fmt": "%(levelprefix)s %(asctime)s | %(request_line)s %(status_code)s",
                "datefmt": "%Y-%m-%d %H:%M:%S",
            }
        },
        "handlers": {
            "default": {
                "formatter": "default",
                "class": "logging.StreamHandler",
                "stream": "ext://sys.stdout",
            },
            "access": {
                "formatter": "access",
                "class": "logging.StreamHandler",
                "stream": "ext://sys.stdout",
            }
        },
        "loggers": {
            "uvicorn.access": {
                "handlers": ["access"],
                "level": "INFO",
                "propagate": False
            }
        },
        "root": {
            "level": "INFO",
            "handlers": ["default"]
        }
    }
