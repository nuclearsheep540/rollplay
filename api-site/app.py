# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import os
from fastapi import FastAPI, HTTPException, Depends, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import logging
from uuid import UUID
from config.settings import Settings
from models.base import get_db
from commands.user_commands import GetOrCreateUser, AddTempGameId
from commands.character_commands import GetUserCharacters
from commands.campaign_commands import GetUserCampaigns, CreateCampaign, GetCampaignGames
from commands.game_commands import GetUserGames, CreateGame, StartGame, EndGame
from commands.friendship_commands import SendFriendRequest, AcceptFriendRequest, RejectFriendRequest, RemoveFriend, GetFriendsList, GetPendingFriendRequests, GetSentFriendRequests
from schemas.user_schemas import UserResponse
from schemas.character_schemas import CharacterResponse
from schemas.campaign_schemas import CampaignResponse, CampaignCreate
from schemas.game_schemas import GameResponse, GameCreate
from schemas.friendship_schemas import FriendshipResponse, FriendRequestCreate, FriendRequestAction, FriendResponse, FriendRequestResponse
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

class TempGameIdRequest(BaseModel):
    game_id: str

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

@app.post("/api/users/temp-game-id", response_model=UserResponse)
async def add_temp_game_id(
    request: TempGameIdRequest,
    db: Session = Depends(get_db),
    authenticated_email: str = Depends(verify_auth_token)
):
    """
    Add a temporary game ID to the authenticated user's list.
    
    This is a temporary endpoint for storing game IDs created via api-game
    until we fully migrate to the new campaign system.
    """
    try:
        # Get user first to get user ID
        user_command = GetOrCreateUser(db)
        user, _ = user_command.execute(authenticated_email)
        
        # Add game ID to user
        add_game_command = AddTempGameId(db)
        updated_user = add_game_command.execute(user.id, request.game_id)
        
        return UserResponse.from_orm(updated_user)
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
    - Returns all campaigns where user is DM
    
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

@app.post("/api/campaigns/", response_model=CampaignResponse)
async def create_campaign(
    campaign_data: CampaignCreate,
    db: Session = Depends(get_db),
    authenticated_email: str = Depends(verify_auth_token)
):
    """
    Create a new campaign.
    
    This endpoint:
    - Validates auth token and gets user email
    - Creates new campaign with authenticated user as DM
    
    Returns:
        CampaignResponse: Created campaign data
    """
    try:
        # Get user first to get user ID
        user_command = GetOrCreateUser(db)
        user, _ = user_command.execute(authenticated_email)
        
        # Create campaign
        create_command = CreateCampaign(db)
        campaign = create_command.execute(user.id, campaign_data.name, campaign_data.description)
        
        return CampaignResponse.from_orm(campaign)
    except ValueError as e:
        # Business logic errors
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/campaigns/{campaign_id}/games/", response_model=list[GameResponse])
async def get_campaign_games(
    campaign_id: UUID,
    db: Session = Depends(get_db),
    authenticated_email: str = Depends(verify_auth_token)
):
    """
    Get all games for a specific campaign.
    
    Returns:
        List[GameResponse]: List of games in the campaign
    """
    try:
        games_command = GetCampaignGames(db)
        games = games_command.execute(campaign_id)
        
        return [GameResponse.from_orm(game) for game in games]
    except ValueError as e:
        # Business logic errors
        raise HTTPException(status_code=400, detail=str(e))

# Game endpoints

@app.get("/api/games/", response_model=list[GameResponse])
async def get_user_games(
    db: Session = Depends(get_db),
    authenticated_email: str = Depends(verify_auth_token)
):
    """
    Get all games for the authenticated user.
    
    This endpoint:
    - Validates auth token and gets user email
    - Returns all games where user is DM or player
    
    Returns:
        List[GameResponse]: List of user's games
    """
    try:
        # Get user first to get user ID
        user_command = GetOrCreateUser(db)
        user, _ = user_command.execute(authenticated_email)
        
        # Get user's games
        games_command = GetUserGames(db)
        games = games_command.execute(user.id)
        
        return [GameResponse.from_orm(game) for game in games]
    except ValueError as e:
        # Business logic errors
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/campaigns/{campaign_id}/games/", response_model=GameResponse)
async def create_game(
    campaign_id: UUID,
    game_data: GameCreate,
    db: Session = Depends(get_db),
    authenticated_email: str = Depends(verify_auth_token)
):
    """
    Create a new game session within a campaign.
    
    Returns:
        GameResponse: Created game data
    """
    try:
        # Get user first to get user ID
        user_command = GetOrCreateUser(db)
        user, _ = user_command.execute(authenticated_email)
        
        # Create game
        create_command = CreateGame(db)
        game = create_command.execute(
            campaign_id=campaign_id,
            dm_id=user.id,
            session_name=game_data.session_name,
            max_players=game_data.max_players,
            seat_colors=game_data.seat_colors
        )
        
        return GameResponse.from_orm(game)
    except ValueError as e:
        # Business logic errors
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/games/{game_id}/start", response_model=GameResponse)
async def start_game(
    game_id: UUID,
    db: Session = Depends(get_db),
    authenticated_email: str = Depends(verify_auth_token)
):
    """
    Start a game session.
    
    Returns:
        GameResponse: Updated game data
    """
    try:
        start_command = StartGame(db)
        game = start_command.execute(game_id)
        
        return GameResponse.from_orm(game)
    except ValueError as e:
        # Business logic errors
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/games/{game_id}/end", response_model=GameResponse)
async def end_game(
    game_id: UUID,
    db: Session = Depends(get_db),
    authenticated_email: str = Depends(verify_auth_token)
):
    """
    End a game session.
    
    Returns:
        GameResponse: Updated game data
    """
    try:
        end_command = EndGame(db)
        game = end_command.execute(game_id)
        
        return GameResponse.from_orm(game)
    except ValueError as e:
        # Business logic errors
        raise HTTPException(status_code=400, detail=str(e))

# Friend endpoints

@app.post("/api/friends/request", response_model=FriendshipResponse)
async def send_friend_request(
    request: FriendRequestCreate,
    db: Session = Depends(get_db),
    authenticated_email: str = Depends(verify_auth_token)
):
    """
    Send a friend request to a user by screen name.
    
    Returns:
        FriendshipResponse: Created friendship request data
    """
    try:
        # Get user first to get user ID
        user_command = GetOrCreateUser(db)
        user, _ = user_command.execute(authenticated_email)
        
        # Send friend request
        send_request_command = SendFriendRequest(db)
        friendship = send_request_command.execute(user.id, request.screen_name)
        
        return FriendshipResponse.from_orm(friendship)
    except ValueError as e:
        # Business logic errors
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/friends/", response_model=list[FriendResponse])
async def get_friends_list(
    db: Session = Depends(get_db),
    authenticated_email: str = Depends(verify_auth_token)
):
    """
    Get the authenticated user's friends list.
    
    Returns:
        List[FriendResponse]: List of user's friends
    """
    try:
        # Get user first to get user ID
        user_command = GetOrCreateUser(db)
        user, _ = user_command.execute(authenticated_email)
        
        # Get friends list
        friends_command = GetFriendsList(db)
        friends = friends_command.execute(user.id)
        
        return [FriendResponse.from_orm(friend) for friend in friends]
    except ValueError as e:
        # Business logic errors
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/friends/requests/received", response_model=list[FriendRequestResponse])
async def get_pending_friend_requests(
    db: Session = Depends(get_db),
    authenticated_email: str = Depends(verify_auth_token)
):
    """
    Get pending friend requests sent to the authenticated user.
    
    Returns:
        List[FriendRequestResponse]: List of pending friend requests
    """
    try:
        # Get user first to get user ID
        user_command = GetOrCreateUser(db)
        user, _ = user_command.execute(authenticated_email)
        
        # Get pending requests
        requests_command = GetPendingFriendRequests(db)
        requests = requests_command.execute(user.id)
        
        return [FriendRequestResponse.from_orm(request) for request in requests]
    except ValueError as e:
        # Business logic errors
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/friends/requests/sent", response_model=list[FriendRequestResponse])
async def get_sent_friend_requests(
    db: Session = Depends(get_db),
    authenticated_email: str = Depends(verify_auth_token)
):
    """
    Get friend requests sent by the authenticated user.
    
    Returns:
        List[FriendRequestResponse]: List of sent friend requests
    """
    try:
        # Get user first to get user ID
        user_command = GetOrCreateUser(db)
        user, _ = user_command.execute(authenticated_email)
        
        # Get sent requests
        requests_command = GetSentFriendRequests(db)
        requests = requests_command.execute(user.id)
        
        return [FriendRequestResponse.from_orm(request) for request in requests]
    except ValueError as e:
        # Business logic errors
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/friends/accept", response_model=FriendshipResponse)
async def accept_friend_request(
    request: FriendRequestAction,
    db: Session = Depends(get_db),
    authenticated_email: str = Depends(verify_auth_token)
):
    """
    Accept a friend request.
    
    Returns:
        FriendshipResponse: Updated friendship data
    """
    try:
        # Get user first to get user ID
        user_command = GetOrCreateUser(db)
        user, _ = user_command.execute(authenticated_email)
        
        # Accept request
        accept_command = AcceptFriendRequest(db)
        friendship = accept_command.execute(request.friendship_id, user.id)
        
        return FriendshipResponse.from_orm(friendship)
    except ValueError as e:
        # Business logic errors
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/friends/reject", response_model=FriendshipResponse)
async def reject_friend_request(
    request: FriendRequestAction,
    db: Session = Depends(get_db),
    authenticated_email: str = Depends(verify_auth_token)
):
    """
    Reject a friend request.
    
    Returns:
        FriendshipResponse: Updated friendship data
    """
    try:
        # Get user first to get user ID
        user_command = GetOrCreateUser(db)
        user, _ = user_command.execute(authenticated_email)
        
        # Reject request
        reject_command = RejectFriendRequest(db)
        friendship = reject_command.execute(request.friendship_id, user.id)
        
        return FriendshipResponse.from_orm(friendship)
    except ValueError as e:
        # Business logic errors
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/api/friends/{friend_id}")
async def remove_friend(
    friend_id: UUID,
    db: Session = Depends(get_db),
    authenticated_email: str = Depends(verify_auth_token)
):
    """
    Remove a friend.
    
    Returns:
        Success message
    """
    try:
        # Get user first to get user ID
        user_command = GetOrCreateUser(db)
        user, _ = user_command.execute(authenticated_email)
        
        # Remove friend
        remove_command = RemoveFriend(db)
        success = remove_command.execute(user.id, friend_id)
        
        return {"message": "Friend removed successfully"}
    except ValueError as e:
        # Business logic errors
        raise HTTPException(status_code=400, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8082)