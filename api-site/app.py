# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import os
from fastapi import FastAPI, HTTPException, Depends, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import logging
from config.settings import Settings
from models.base import get_db
from commands.user_commands import GetOrCreateUser
from commands.character_commands import GetUserCharacters
from commands.campaign_commands import GetUserCampaigns
from schemas.user_schemas import UserResponse
from schemas.character_schemas import CharacterResponse
from schemas.campaign_schemas import CampaignResponse
from sqlalchemy.orm import Session
from auth.jwt_helper import JWTHelper

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize settings and JWT helper
settings = Settings()
jwt_helper = JWTHelper()

# Create FastAPI app
app = FastAPI(
    title="Rollplay Site API",
    description="Site-wide API for Tabletop Tavern - handles landing page, user management, and core site functionality",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request/Response models

class HealthResponse(BaseModel):
    status: str
    service: str
    version: str

# Health check endpoint
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint for load balancer"""
    return HealthResponse(
        status="healthy",
        service="api-site",
        version="1.0.0"
    )

# Authentication dependency
async def verify_auth_token(request: Request):
    """Verify auth token using JWT validation"""
    auth_token = jwt_helper.get_token_from_cookie(request)
    
    if not auth_token:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    email = jwt_helper.verify_auth_token(auth_token)
    if not email:
        raise HTTPException(status_code=401, detail="Invalid or expired authentication token")
        
    return email

# Site endpoints (non-game related)

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "Rollplay Site API",
        "version": "1.0.0",
        "description": "Site-wide API for Tabletop Tavern"
    }

# User endpoints

@app.get("/api/test")
async def test_route():
    """Test route to check if API is working"""
    return {"message": "API is working"}

@app.get("/api/users/", response_model=UserResponse)
async def get_or_create_user(
    db: Session = Depends(get_db),
    authenticated_email: str = Depends(verify_auth_token)
):
    """
    Get authenticated user's data, or create if doesn't exist.
    
    This endpoint handles the authentication flow:
    - Validates auth token with api-auth service
    - If user exists: returns user data
    - If user doesn't exist: creates new user with authenticated email
    
    Returns:
        UserResponse: User data for authenticated user
    """
    try:
        # TODO: breakpoint here and test its reachable
        command = GetOrCreateUser(db)
        user, was_created = command.execute(authenticated_email)
        return UserResponse.from_orm(user)
    except ValueError as e:
        # Business logic errors
        raise HTTPException(status_code=400, detail=str(e))

# Character endpoints

@app.get("/api/characters/", response_model=list[CharacterResponse])
async def get_user_characters(
    db: Session = Depends(get_db),
    authenticated_email: str = Depends(verify_auth_token)
):
    """
    Get all characters for the authenticated user.
    
    This endpoint:
    - Validates auth token and gets user email
    - Looks up user by email to get user ID
    - Returns all characters belonging to that user
    
    Returns:
        List[CharacterResponse]: List of user's characters
    """
    try:
        # Get user first to get user ID
        user_command = GetOrCreateUser(db)
        user, _ = user_command.execute(authenticated_email)
        
        # Get user's characters
        characters_command = GetUserCharacters(db)
        characters = characters_command.execute(user.id)
        
        return [CharacterResponse.from_orm(char) for char in characters]
    except ValueError as e:
        # Business logic errors
        raise HTTPException(status_code=400, detail=str(e))

# Campaign endpoints

@app.get("/api/campaigns/", response_model=list[CampaignResponse])
async def get_user_campaigns(
    db: Session = Depends(get_db),
    authenticated_email: str = Depends(verify_auth_token)
):
    """
    Get all campaigns for the authenticated user.
    
    This endpoint:
    - Validates auth token and gets user email
    - Looks up user by email to get user ID
    - Returns all campaigns where user is DM or player
    
    Returns:
        List[CampaignResponse]: List of user's campaigns
    """
    try:
        # Get user first to get user ID
        user_command = GetOrCreateUser(db)
        user, _ = user_command.execute(authenticated_email)
        
        # Get user's campaigns
        campaigns_command = GetUserCampaigns(db)
        campaigns = campaigns_command.execute(user.id)
        
        return [CampaignResponse.from_orm(campaign) for campaign in campaigns]
    except ValueError as e:
        # Business logic errors
        raise HTTPException(status_code=400, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8082)