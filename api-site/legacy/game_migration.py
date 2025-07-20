# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import Dict, Any
from uuid import UUID

from repositories.campaign_repository import CampaignRepository
from repositories.game_repository import GameRepository
from commands.migration_commands import MigrationCommands
from services.hot_cold_migration_service import HotColdMigrationService
from models.base import get_db
from auth.jwt_helper import JWTHelper

router = APIRouter()

# Initialize JWT helper for authentication
jwt_helper = JWTHelper()


def verify_auth_token(request: Request):
    """Verify auth token using JWT validation"""
    auth_token = jwt_helper.get_token_from_cookie(request)
    
    if not auth_token:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    email = jwt_helper.verify_auth_token(auth_token)
    if not email:
        raise HTTPException(status_code=401, detail="Invalid or expired authentication token")
        
    return email


def get_migration_service(db: Session = Depends(get_db)) -> HotColdMigrationService:
    """Dependency injection for migration service."""
    campaign_repo = CampaignRepository(db)
    game_repo = GameRepository(db)
    migration_commands = MigrationCommands(campaign_repo, game_repo)
    return HotColdMigrationService(campaign_repo, game_repo, migration_commands)


@router.post("/campaigns/{campaign_id}/start-game")
def start_game_session(
    campaign_id: UUID,
    session_config: Dict[str, Any] = None,
    migration_service: HotColdMigrationService = Depends(get_migration_service),
    authenticated_email: str = Depends(verify_auth_token)
):
    """Start a game session by migrating campaign to hot storage."""
    try:
        if session_config is None:
            session_config = {}
        
        result = migration_service.start_game_session(campaign_id, session_config)
        
        return {
            "success": True,
            "message": "Game session started successfully",
            "data": {
                "game_id": result["game_id"],
                "status": result["status"],
                "started_at": result["started_at"].isoformat() if result.get("started_at") else None
            }
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/games/{game_id}/end-game")
def end_game_session(
    game_id: UUID,
    migration_service: HotColdMigrationService = Depends(get_migration_service),
    authenticated_email: str = Depends(verify_auth_token)
):
    """End a game session by migrating hot storage back to cold storage."""
    try:
        result = migration_service.end_game_session(game_id)
        
        return {
            "success": True,
            "message": "Game session ended successfully",
            "data": {
                "game_id": result["game_id"],
                "status": result["status"],
                "campaign_id": result["campaign_id"],
                "ended_at": result["ended_at"].isoformat() if result.get("ended_at") else None
            }
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/games/{game_id}/access-check")
def validate_game_access(
    game_id: UUID,
    migration_service: HotColdMigrationService = Depends(get_migration_service),
    authenticated_email: str = Depends(verify_auth_token)
):
    """Validate that a game can be accessed (hot storage exists)."""
    try:
        result = migration_service.validate_game_access(game_id)
        
        if result["valid"]:
            return {
                "success": True,
                "message": "Game access validated",
                "data": {
                    "game_id": result["game_id"],
                    "campaign_id": result["campaign_id"],
                    "status": result["status"]
                }
            }
        else:
            # Return 404 for inactive games (natural access control)
            if result["reason"] == "game_not_active":
                raise HTTPException(status_code=404, detail="Game not active")
            elif result["reason"] == "game_not_found":
                raise HTTPException(status_code=404, detail="Game not found")
            else:
                raise HTTPException(status_code=400, detail=result["reason"])
                
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/games/{game_id}")
def get_game_session(
    game_id: UUID,
    migration_service: HotColdMigrationService = Depends(get_migration_service),
    authenticated_email: str = Depends(verify_auth_token)
):
    """Get game session data (only works if game is active)."""
    try:
        # First validate access
        access_result = migration_service.validate_game_access(game_id)
        
        if not access_result["valid"]:
            if access_result["reason"] == "game_not_active":
                raise HTTPException(status_code=404, detail="Game not active")
            elif access_result["reason"] == "game_not_found":
                raise HTTPException(status_code=404, detail="Game not found")
            else:
                raise HTTPException(status_code=400, detail=access_result["reason"])
        
        # TODO: Get hot storage data from MongoDB
        # hot_storage_data = await mongodb_client.get_active_session(game_id)
        
        return {
            "success": True,
            "message": "Game session found",
            "data": {
                "game_id": access_result["game_id"],
                "campaign_id": access_result["campaign_id"],
                "status": access_result["status"]
                # TODO: Add hot storage data when MongoDB is integrated
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")