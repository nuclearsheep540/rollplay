# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    """Application settings"""
    
    # Environment
    environment: str = "dev"
    
    # JWT Settings
    jwt_secret_key: str = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    
    # Email Settings
    smtp_server: str = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    smtp_port: int = int(os.getenv("SMTP_PORT", "587"))
    smtp_username: str = os.getenv("SMTP_USERNAME", "")
    smtp_password: str = os.getenv("SMTP_PASSWORD", "")
    from_email: str = os.getenv("FROM_EMAIL", "noreply@tabletop-tavern.com")
    
    # Frontend URL for magic links
    frontend_url: str = os.getenv("FRONTEND_URL", "http://localhost:3000")
    
    # Database Settings (PostgreSQL)
    database_url: str = os.getenv("DATABASE_URL", "postgresql://user:password@localhost/rollplay")
    
    # Redis Settings (for production token blacklisting)
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379")
    
    # API Settings
    api_host: str = "0.0.0.0"
    api_port: int = 8083
    
    class Config:
        env_file = ".env"