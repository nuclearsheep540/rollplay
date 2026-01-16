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

    # JWT Settings - required, no defaults for secrets
    JWT_SECRET_KEY: str
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    # Email Settings - required for production
    SMTP_SERVER: str
    SMTP_PORT: int
    SMTP_USERNAME: str
    SMTP_PASSWORD: str
    FROM_EMAIL: str

    # Frontend URL for magic links - required
    NEXT_PUBLIC_API_URL: str

    # Redis Settings - required for token blacklisting
    REDIS_URL: str

    # API Settings - safe defaults for binding
    api_host: str = "0.0.0.0"
    api_port: int = 8083