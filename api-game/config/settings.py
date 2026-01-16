from enum import Enum
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(str, Enum):
    """The environment options in which the application can be configured as"""
    production = "production"
    staging = "staging"
    development = "development"


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file='.env',
        env_file_encoding='utf-8',
        extra='ignore'
    )

    # APP
    APP_NAME: str = "rollplay_app"
    app_version: Optional[str] = None
    ENVIRONMENT: Environment = Environment.development

    # MONGODB (for active game sessions)
    MONGO_INITDB_ROOT_USERNAME: Optional[str] = None
    MONGO_INITDB_ROOT_PASSWORD: Optional[str] = None

    # POSTGRESQL (for user/character/game data)
    POSTGRES_HOST: str = "postgres"
    POSTGRES_PORT: str = "5432"
    POSTGRES_DB: str = "rollplay"

    # Application database credentials (limited privileges)
    APP_DB_USER: str = "rollplay"
    APP_DB_PASSWORD: Optional[str] = None

    # LOGGING
    logging_level: str = "DEBUG"
    logging_email_from: Optional[str] = None
    logging_email_to: Optional[str] = None
    logging_email_subject: Optional[str] = None

    @property
    def APP_DATABASE_URL(self) -> str:
        return f"postgresql://{self.APP_DB_USER}:{self.APP_DB_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    @property
    def logging_filename(self) -> str:
        return f"/var/log/{self.APP_NAME}/{self.APP_NAME}.log"


# Singleton instance - created once at module import
_settings: Optional[Settings] = None


def get_settings() -> dict:
    """Return settings as a dictionary for backward compatibility."""
    global _settings
    if _settings is None:
        _settings = Settings()

    return {
        'MONGO_USER': _settings.MONGO_INITDB_ROOT_USERNAME,
        'MONGO_PASS': _settings.MONGO_INITDB_ROOT_PASSWORD,
        'APP_NAME': _settings.APP_NAME,
        'APP_VERSION': _settings.app_version,
        'environment': _settings.ENVIRONMENT,
        'POSTGRES_HOST': _settings.POSTGRES_HOST,
        'POSTGRES_PORT': _settings.POSTGRES_PORT,
        'POSTGRES_DB': _settings.POSTGRES_DB,
        'APP_DB_USER': _settings.APP_DB_USER,
        'APP_DB_PASSWORD': _settings.APP_DB_PASSWORD,
        'APP_DATABASE_URL': _settings.APP_DATABASE_URL,
        'logging_level': _settings.logging_level,
        'logging_email_from': _settings.logging_email_from,
        'logging_email_to': _settings.logging_email_to,
        'logging_email_subject': _settings.logging_email_subject,
        'logging_filename': _settings.logging_filename,
    }