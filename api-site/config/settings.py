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
    # To get these values Settings.schema()["properties"]

    # APP
    APP_NAME = "rollplay_site"
    APP_VERSION = env.get("app_version")
    environment:Environment = getattr(Environment, env.get("environment"))
    
    # DATABASE - PostgreSQL for site-wide data
    POSTGRES_USER: str = env.get("POSTGRES_USER", "rollplay")
    POSTGRES_PASSWORD: str = env.get("POSTGRES_PASSWORD")
    POSTGRES_HOST: str = env.get("POSTGRES_HOST", "db-core")
    POSTGRES_PORT: str = env.get("POSTGRES_PORT", "5432")
    POSTGRES_DB: str = env.get("POSTGRES_DB", "rollplay_core")

    # LOGGING
    logging_level = "DEBUG"
    logging_email_from = env.get("logging_email_from")
    logging_email_to = env.get("logging_email_to")
    logging_email_subject = env.get("logging_email_subject")
    logging_filename = f"/var/log/{APP_NAME}/{APP_NAME}.log"

def get_settings():
    config = {}
    for key, value in Settings.schema()["properties"].items():
        config.update({key: value["default"]})
    return config