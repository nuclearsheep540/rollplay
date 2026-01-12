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
    APP_NAME = "rollplay_app"
    APP_VERSION = env.get("app_version")
    environment:Environment = getattr(Environment, env.get("ENVIRONMENT"))
    
    # MONGODB (for active game sessions)
    MONGO_USER = env.get("MONGO_INITDB_ROOT_USERNAME")
    MONGO_PASS = env.get("MONGO_INITDB_ROOT_PASSWORD")
    
    # POSTGRESQL (for user/character/game data)
    POSTGRES_HOST: str = env.get("POSTGRES_HOST", "postgres")
    POSTGRES_PORT: str = env.get("POSTGRES_PORT", "5432")
    POSTGRES_DB: str = env.get("POSTGRES_DB", "rollplay")
    
    # Application database credentials (limited privileges)
    APP_DB_USER: str = "rollplay"
    APP_DB_PASSWORD: str = env.get("APP_DB_PASSWORD")
    
    # Computed database URL
    @property
    def APP_DATABASE_URL(self) -> str:
        return f"postgresql://{self.APP_DB_USER}:{self.APP_DB_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"


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