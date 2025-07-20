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
    
    # Environment vars
    environment: Environment = Environment.development
    
    # DB
    app_database_url: str = env.get(
        "APP_DATABASE_URL",
        "postgresql://postgres:postgres@postgres:5432/rollplay"
    )
    APP_DATABASE_URL = app_database_url  # Backwards compatibility
    
    # JWT
    jwt_secret_key: str = env.get("JWT_SECRET_KEY", "your-secret-key")
    jwt_algorithm: str = env.get("JWT_ALGORITHM", "HS256")
    
    class Config:
        case_sensitive = False