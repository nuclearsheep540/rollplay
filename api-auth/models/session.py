# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any

class LoginRequest(BaseModel):
    """Login request model"""
    email: EmailStr

class LoginResponse(BaseModel):
    """Login response model"""
    success: bool
    message: str
    email: str

class ValidateRequest(BaseModel):
    """Token validation request model"""
    token: str

class ValidateResponse(BaseModel):
    """Token validation response model"""
    valid: bool
    user: Optional[Dict[str, Any]] = None
    message: str

class TokenResponse(BaseModel):
    """Token response model"""
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    expires_in: int
    user: Dict[str, Any]