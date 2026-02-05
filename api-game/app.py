# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later
from fastapi import FastAPI, Response, Request, Query
import logging
from typing import Optional

from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Initialize Sentry for monitoring and security alerts
from sentry_config import init_sentry
init_sentry()

from gameservice import GameService, GameSettings
from adventure_log_service import AdventureLogService
from mapservice import MapService
from message_templates import format_message, MESSAGE_TEMPLATES
from models.log_type import LogType
from websocket_handlers.connection_manager import manager as connection_manager
from schemas.session_schemas import SessionStartRequest, SessionStartResponse, SessionEndRequest, SessionEndResponse
from datetime import datetime

logger = logging.getLogger()
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


adventure_log = AdventureLogService()
map_service = MapService()


@app.get("/game/{room_id}/logs")
async def get_room_logs(room_id: str, limit: int = 100, skip: int = 0):
    """Get adventure logs for a room"""
    try:
        logs = adventure_log.get_room_logs(room_id, limit, skip)
        count = adventure_log.get_room_log_count(room_id)
        
        return {
            "logs": logs,
            "total_count": count,
            "returned_count": len(logs)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/game/{room_id}/logs/stats")
async def get_room_log_stats(room_id: str):
    """Get log statistics for a room"""
    try:
        stats = adventure_log.get_room_stats(room_id)
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/game/{room_id}/active-map")
async def get_active_map(room_id: str):
    """Get the currently active map for a room"""
    try:
        active_map = map_service.get_active_map(room_id)
        
        if active_map:
            logger.info(f"🌐 HTTP endpoint returning active map for room {room_id}: {active_map.get('filename')} with grid_config: {active_map.get('grid_config')}")
            return {"active_map": active_map}
        else:
            logger.info(f"🌐 HTTP endpoint: No active map found for room {room_id}")
            raise HTTPException(status_code=404, detail="No active map found for this room")
            
    except Exception as e:
        logger.error(f"Error getting active map for room {room_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/game/{room_id}/map")
async def update_map(room_id: str, request: dict):
    """Update complete map object - server authoritative atomic update"""
    try:
        updated_map = request.get("map")
        updated_by = request.get("updated_by", "unknown")
        
        if not updated_map or not updated_map.get("filename"):
            raise HTTPException(status_code=400, detail="Complete map object with filename is required")
        
        filename = updated_map.get("filename")
        
        # Replace entire map in database (atomic)
        logger.info(f"🌐 HTTP: Updating complete map for room {room_id}, filename {filename} by {updated_by}")
        success = map_service.update_complete_map(room_id, updated_map)
        
        if success:
            # Get the updated map to broadcast via WebSocket
            updated_map_result = map_service.get_active_map(room_id)
            
            if updated_map_result:
                # Broadcast the complete updated map to all clients via WebSocket (atomic)
                map_update_message = {
                    "event_type": "map_config_update",
                    "data": {
                        "filename": filename,
                        "grid_config": updated_map_result.get("grid_config"),
                        "map_image_config": updated_map_result.get("map_image_config"),
                        "updated_by": updated_by
                    }
                }
                
                # Broadcast to all connected clients in this room
                await connection_manager.update_room_data(room_id, map_update_message)
                
                logger.info(f"🌐 HTTP: Complete map updated and broadcasted for room {room_id}")
                return {"success": True, "updated_map": updated_map_result}
            else:
                logger.warning(f"🌐 HTTP: Map updated but could not retrieve updated map")
                return {"success": True, "message": "Map updated but could not retrieve updated map"}
        else:
            raise HTTPException(status_code=404, detail="No active map found or no changes made")
            
    except Exception as e:
        logger.error(f"Error updating map config for room {room_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/game/{room_id}/seats")
async def update_seat_count(room_id: str, request: dict):
    """Update the maximum number of seats for a game room and handle displaced players"""
    try:
        check_room = GameService.get_room(id=room_id)
        max_players = request.get("max_players")
        updated_by = request.get("updated_by")
        displaced_players = request.get("displaced_players", [])
        
        # Validate seat count
        if not isinstance(max_players, int) or max_players < 1 or max_players > 8:
            raise HTTPException(status_code=400, detail="Seat count must be between 1 and 8")
        
        # Update seat count in database
        GameService.update_seat_count(room_id, max_players)
        
        # Handle displaced players - move them back to lobby
        for displaced_player in displaced_players:
            player_name = displaced_player.get("playerName")
            if player_name:
                try:
                    print(f"🚪 Moving {player_name} from seat {displaced_player.get('seatId')} to lobby")
                    
                    # Update player's party status in ConnectionManager
                    await connection_manager.remove_player_from_party(room_id, player_name)
                    
                    # Send displacement notification to the player
                    displacement_message = {
                        "event_type": "player_displaced",
                        "data": {
                            "player_name": player_name,
                            "reason": "seat_reduction",
                            "message": f"You have been moved to the lobby due to seat count reduction",
                            "former_seat": displaced_player.get("seatId", "unknown")
                        }
                    }
                    await connection_manager.send_to_player(room_id, player_name, displacement_message)
                    
                    # Log displacement to adventure log
                    log_message = f"{player_name} was moved to lobby due to seat reduction"
                    adventure_log.add_log_entry(
                        room_id=room_id,
                        message=log_message,
                        log_type=LogType.SYSTEM,
                        from_player="System"
                    )
                    
                except Exception as e:
                    print(f"❌ Error handling displaced player {player_name}: {str(e)}")
                    # Continue processing other players even if one fails
        
        # Get current seat layout from database after displacement
        try:
            # Get updated room data to get actual seat layout
            updated_room = GameService.get_room(id=room_id)
            current_seats = updated_room.get("seat_layout", [])
            
            # Create new_seats array matching the new max_players count
            new_seats = []
            for i in range(max_players):
                if i < len(current_seats):
                    # Keep existing player if they weren't displaced
                    player_in_seat = current_seats[i]
                    # Check if this player was displaced
                    was_displaced = any(dp.get("playerName") == player_in_seat for dp in displaced_players)
                    new_seats.append("empty" if was_displaced else player_in_seat)
                else:
                    new_seats.append("empty")
            
            seat_change_message = {
                "event_type": "seat_count_change", 
                "data": {
                    "max_players": max_players,
                    "new_seats": new_seats,
                    "updated_by": updated_by,
                    "displaced_players": displaced_players
                }
            }
            await connection_manager.update_room_data(room_id, seat_change_message)
            print(f"✅ Seat count updated successfully to {max_players}, displaced {len(displaced_players)} players")
        except Exception as e:
            print(f"❌ Error broadcasting seat count change: {str(e)}")
            # Don't fail the entire operation if broadcast fails
        
        return {
            "success": True,
            "room_id": room_id,
            "max_players": max_players,
            "updated_by": updated_by,
            "displaced_players": displaced_players
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/game/{room_id}")
def gameservice_get(room_id):
    check_room = GameService.get_room(id=room_id)
    if check_room:
        # Add current seat layout and seat colors to response
        seat_layout = GameService.get_seat_layout(room_id)
        seat_colors = GameService.get_seat_colors(room_id)
        return {
            **check_room,
            "current_seat_layout": seat_layout,
            "seat_colors": seat_colors
        }
    else:
        return Response(status_code=404, content=f'{{"error": "Room {room_id} not found"}}')

@app.get("/game/{room_id}/roles")
def get_player_roles(room_id: str, playerName: str):
    """Check player's roles (host, moderator, DM) in a room"""
    try:
        check_room = GameService.get_room(id=room_id)
        if not check_room:
            raise HTTPException(status_code=404, detail=f"Room {room_id} not found")
        
        is_host = GameService.is_host(room_id, playerName)
        is_moderator = GameService.is_moderator(room_id, playerName)
        is_dm = GameService.is_dm(room_id, playerName)
        
        return {
            "is_host": is_host,
            "is_moderator": is_moderator,
            "is_dm": is_dm
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/game/{room_id}/moderators")
def add_moderator(room_id: str, request: dict):
    """Add a player as moderator"""
    try:
        check_room = GameService.get_room(id=room_id)
        if not check_room:
            raise HTTPException(status_code=404, detail=f"Room {room_id} not found")
        
        player_name = request.get("player_name")
        if not player_name:
            raise HTTPException(status_code=400, detail="player_name is required")
        
        success = GameService.add_moderator(room_id, player_name)
        if success:
            return {"success": True, "message": f"{player_name} added as moderator"}
        else:
            return {"success": False, "message": f"{player_name} is already a moderator"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/game/{room_id}/moderators")
def remove_moderator(room_id: str, request: dict):
    """Remove a player from moderators"""
    try:
        check_room = GameService.get_room(id=room_id)
        if not check_room:
            raise HTTPException(status_code=404, detail=f"Room {room_id} not found")
        
        player_name = request.get("player_name")
        if not player_name:
            raise HTTPException(status_code=400, detail="player_name is required")
        
        success = GameService.remove_moderator(room_id, player_name)
        if success:
            return {"success": True, "message": f"{player_name} removed from moderators"}
        else:
            return {"success": False, "message": f"{player_name} was not a moderator"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/game/{room_id}/dm")
async def set_dm(room_id: str, request: dict):
    """Set a player as dungeon master"""
    try:
        check_room = GameService.get_room(id=room_id)
        if not check_room:
            raise HTTPException(status_code=404, detail=f"Room {room_id} not found")
        
        player_name = request.get("player_name")
        if not player_name:
            raise HTTPException(status_code=400, detail="player_name is required")
        
        success = GameService.set_dm(room_id, player_name)
        if success:
            # Broadcast role change event to all clients in the room
            from websocket_handlers.connection_manager import manager
            role_change_message = {
                "event_type": "role_change",
                "data": {
                    "action": "set_dm",
                    "target_player": player_name,
                    "changed_by": "System",
                    "message": f"{player_name} has been set as Dungeon Master"
                }
            }
            await manager.update_room_data(room_id, role_change_message)
            
            return {"success": True, "message": f"{player_name} set as Dungeon Master"}
        else:
            return {"success": False, "message": "Failed to set Dungeon Master"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/game/{room_id}/dm")
async def unset_dm(room_id: str):
    """Remove the current dungeon master"""
    try:
        check_room = GameService.get_room(id=room_id)
        if not check_room:
            raise HTTPException(status_code=404, detail=f"Room {room_id} not found")
        
        # Get current DM name before removing
        current_dm = check_room.get("dungeon_master", "")
        
        success = GameService.unset_dm(room_id)
        if success:
            # Broadcast role change event to all clients in the room
            from websocket_handlers.connection_manager import manager
            role_change_message = {
                "event_type": "role_change",
                "data": {
                    "action": "unset_dm",
                    "target_player": current_dm,
                    "changed_by": "System",
                    "message": f"Dungeon Master role has been removed"
                }
            }
            await manager.update_room_data(room_id, role_change_message)
            
            return {"success": True, "message": "Dungeon Master removed"}
        else:
            return {"success": False, "message": "No Dungeon Master to remove"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/game/")
def gameservice_create(settings: GameSettings):
    new_room = GameService.create_room(settings=settings)
    return {"id": new_room}

@app.post("/game/{room_id}")
def gameservice_create_with_id(room_id: str, settings: GameSettings):
    """Create a game room with a specific ID (for PostgreSQL integration)"""
    new_room = GameService.create_room(settings=settings, room_id=room_id)
    return {"id": new_room}

@app.post("/game/session/start", response_model=SessionStartResponse)
async def create_session(request: SessionStartRequest):
    """
    Create MongoDB active game for a session.

    This endpoint is called by api-site when starting a session.
    It creates a minimal game with empty seats that players fill during gameplay.

    Request:
    {
        "session_id": "550e8400-e29b-41d4-a716-446655440000",
        "dm_username": "player1",
        "max_players": 8
    }

    Response:
    {
        "success": true,
        "session_id": "550e8400-e29b-41d4-a716-446655440000",
        "message": "Game created successfully for session"
    }
    """
    try:
        # Check if game already exists for this session
        existing = GameService.get_room(request.session_id)
        if existing:
            raise HTTPException(
                status_code=409,
                detail="Game already exists for this session"
            )

        # Default color palette for seats
        def get_default_color(index):
            colors = [
                "#3b82f6",  # blue
                "#ef4444",  # red
                "#22c55e",  # green
                "#f97316",  # orange
                "#a855f7",  # purple
                "#06b6d4",  # cyan
                "#ec4899",  # pink
                "#65a30d",  # lime
            ]
            return colors[index] if index < len(colors) else "#3b82f6"

        # Convert assets to dict format for MongoDB storage
        available_assets = [asset.model_dump() for asset in request.assets] if request.assets else []

        # Create minimal session
        settings = GameSettings(
            max_players=request.max_players,
            seat_layout=["empty"] * request.max_players,
            seat_colors={str(i): get_default_color(i) for i in range(request.max_players)},
            created_at=datetime.utcnow(),
            moderators=[],
            dungeon_master=request.dm_username.lower(),
            room_host=request.dm_username.lower(),
            available_assets=available_assets,
            campaign_id=request.campaign_id,  # For proxying asset requests to api-site
            audio_state=request.audio_config if request.audio_config else {}
        )

        # Use session_id as MongoDB _id (back-reference to PostgreSQL session)
        game_id = GameService.create_room(settings, room_id=request.session_id)

        logger.info(f"✅ Created game {game_id} for session {request.session_id} with {len(request.joined_user_ids)} joined players")

        return SessionStartResponse(
            success=True,
            session_id=game_id,  # Return MongoDB document ID as session_id for api-site
            message="Game created successfully for session"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Failed to create session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/game/session/end", response_model=SessionEndResponse)
async def end_session(request: SessionEndRequest, validate_only: bool = False):
    """
    Return final game state from MongoDB.

    If validate_only=True: Fetch state but DO NOT delete game (Phase 1 of fail-safe pattern)
    If validate_only=False: Deprecated - use DELETE /game/session/{session_id} instead

    This endpoint is called by api-site when pausing/finishing a session.
    The validate_only parameter allows for fail-safe two-phase commit:
    1. Fetch state (this endpoint with validate_only=True)
    2. Write to PostgreSQL
    3. Delete game (DELETE endpoint)

    Request:
    {
        "session_id": "550e8400-e29b-41d4-a716-446655440000"
    }

    Response:
    {
        "success": true,
        "final_state": {
            "players": [...],
            "session_stats": {...}
        }
    }
    """
    try:
        # Get game room from MongoDB using session_id (which maps to MongoDB _id)
        room = GameService.get_room(request.session_id)
        if not room:
            raise HTTPException(status_code=404, detail="Game not found for session")

        # Extract player data from seat_layout
        players = []
        for idx, seat in enumerate(room.get("seat_layout", [])):
            if seat != "empty":
                players.append({
                    "player_name": seat,
                    "seat_position": idx,
                    "seat_color": room.get("seat_colors", {}).get(str(idx))
                })

        # Calculate session duration
        created_at = room.get("created_at")
        duration_minutes = 0
        if created_at:
            # Handle datetime object directly from MongoDB
            if isinstance(created_at, datetime):
                duration = datetime.utcnow() - created_at
                duration_minutes = int(duration.total_seconds() / 60)

        # Get adventure log count
        log_count = adventure_log.get_room_log_count(request.session_id)

        # Build final state
        final_state = {
            "players": players,
            "session_stats": {
                "duration_minutes": duration_minutes,
                "total_logs": log_count,
                "max_players": room.get("max_players", 0)
            },
            "audio_state": room.get("audio_state", {})
        }

        # If not validate_only, delete the game (deprecated flow)
        if not validate_only:
            logger.warning(f"⚠️ Using deprecated delete flow for session {request.session_id}")
            GameService.delete_room(request.session_id)

        logger.info(f"✅ Returned final state for session {request.session_id} (validate_only={validate_only})")

        return SessionEndResponse(
            success=True,
            final_state=final_state,
            message="Final state retrieved" if validate_only else "Session ended"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Failed to end session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/game/session/{game_id}")
async def delete_session(game_id: str, keep_logs: bool = True):
    """
    Delete MongoDB active_session.

    Called after PostgreSQL write succeeds (Phase 3 of fail-safe pattern).
    This is the cleanup phase - session data has already been persisted to PostgreSQL.

    Query params:
    - keep_logs: If true, preserve adventure_logs and active_maps (default: true)

    Response:
    {
        "success": true,
        "message": "Session deleted"
    }
    """
    try:
        # Check if session exists
        room = GameService.get_room(game_id)
        if not room:
            # Already deleted - return success
            logger.info(f"✅ Session {game_id} already deleted")
            return {
                "success": True,
                "message": "Session already deleted"
            }

        # Gracefully disconnect all WebSocket clients before deletion
        logger.info(f"🔌 Closing WebSocket connections for room {game_id}")
        await connection_manager.close_room_connections(game_id, reason="Session ended")

        # Delete active_session from MongoDB
        GameService.delete_room(game_id)

        # Optionally delete logs and maps
        if not keep_logs:
            logger.info(f"🗑️ Deleting logs and maps for {game_id}")
            adventure_log.delete_room_logs(game_id)
            map_service.clear_active_map(game_id)

        logger.info(f"✅ Deleted session {game_id} (keep_logs={keep_logs})")

        return {
            "success": True,
            "message": "Session deleted successfully"
        }

    except Exception as e:
        logger.error(f"❌ Failed to delete session {game_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/game/{room_id}/player/character")
async def update_player_character(room_id: str, character_data: dict):
    """
    Update a player's character data in the session.

    Called by api-site when a player changes their character mid-session.
    Updates the seat_layout to include character information.

    Request:
    {
        "player_name": "username",
        "user_id": "uuid",
        "character_id": "uuid",
        "character_name": "Aragorn",
        "character_class": "Ranger",
        "character_race": "Human",
        "level": 5,
        "hp_current": 20,
        "hp_max": 25,
        "ac": 15
    }

    Response:
    {
        "success": true,
        "message": "Character updated"
    }
    """
    try:
        # Verify room exists
        room = GameService.get_room(room_id)
        if not room:
            raise HTTPException(status_code=404, detail="Session not found")

        # Update the character in seat layout
        GameService.update_player_character(room_id, character_data)

        # Broadcast character change to all clients via WebSocket
        player_name = character_data.get("player_name", "unknown")
        character_name = character_data.get("character_name", "unknown")

        change_message = {
            "event_type": "player_character_changed",
            "data": {
                "player_name": player_name,
                "character_id": character_data.get("character_id"),
                "character_name": character_name,
                "character_class": character_data.get("character_class"),
                "character_race": character_data.get("character_race"),
                "level": character_data.get("level"),
                "hp_current": character_data.get("hp_current"),
                "hp_max": character_data.get("hp_max"),
                "ac": character_data.get("ac")
            }
        }

        await connection_manager.broadcast_to_room(room_id, change_message)
        logger.info(f"✅ Updated character for {player_name} to {character_name} in room {room_id}")

        return {
            "success": True,
            "message": "Character updated successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Failed to update character: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/game/{room_id}/seat-layout")
async def update_seat_layout(room_id: str, request: dict):
    """Update the seat layout for a game room"""
    try:
        print(f"🔄 Received seat layout update request for room {room_id}")
        print(f"📝 Request data: {request}")
        
        check_room = GameService.get_room(id=room_id)
        if not check_room:
            print(f"❌ Room {room_id} not found")
            raise HTTPException(status_code=404, detail=f"Room {room_id} not found")
            
        seat_layout = request.get("seat_layout")
        updated_by = request.get("updated_by")
        
        print(f"👤 Updated by: {updated_by}")
        print(f"🪑 New seat layout: {seat_layout}")
        
        # Validate seat layout
        if not isinstance(seat_layout, list):
            print(f"❌ Invalid seat layout type: {type(seat_layout)}")
            raise HTTPException(status_code=400, detail="Seat layout must be an array")
        
        # Get current max_players to validate layout length
        current_max = check_room.get("max_players", 4)
        if len(seat_layout) > current_max:
            print(f"❌ Seat layout too long: {len(seat_layout)} > {current_max}")
            raise HTTPException(
                status_code=400, 
                detail=f"Seat layout cannot exceed {current_max} seats"
            )
        
        # Update MongoDB record
        print(f"💾 Calling GameService.update_seat_layout({room_id}, {seat_layout})")
        GameService.update_seat_layout(room_id, seat_layout)
        print(f"✅ Successfully saved seat layout to database")
        
        # Log the change (only if there are actual players)
        non_empty_seats = [seat for seat in seat_layout if seat != "empty"]
        if non_empty_seats:  # Only log if there are actual players
            player_list = ", ".join(non_empty_seats)
            
            log_message = format_message(MESSAGE_TEMPLATES["party_updated"], players=", ".join(non_empty_seats))
            
            print(f"📜 Adding adventure log: {log_message}")
            adventure_log.add_log_entry(
                room_id=room_id,
                message=log_message,
                log_type=LogType.SYSTEM,
                from_player=updated_by
            )
        
        response_data = {
            "success": True,
            "room_id": room_id,
            "seat_layout": seat_layout,
            "updated_by": updated_by
        }
        print(f"✅ Returning response: {response_data}")
        return response_data
        
    except HTTPException:
        raise  # Re-raise HTTP exceptions
    except Exception as e:
        error_msg = f"❌ Unexpected error in update_seat_layout: {str(e)}"
        print(error_msg)
        logger.error(error_msg)
        raise HTTPException(status_code=500, detail=str(e))
    
@app.delete("/game/{room_id}/logs/system")
async def clear_system_messages(room_id: str, request: dict):
    """Clear all system messages from the adventure log"""
    try:
        check_room = GameService.get_room(id=room_id)
        if not check_room:
            raise HTTPException(status_code=404, detail=f"Room {room_id} not found")
        
        cleared_by = request.get("cleared_by", "Unknown")
        
        print(f"🧹 Clearing system messages for room {room_id} by {cleared_by}")
        
        # Clear system messages from the database
        deleted_count = adventure_log.clear_system_messages(room_id)
        
        print(f"✅ Cleared {deleted_count} system messages")
        
        # Add a log entry about the clearing action
        log_message = format_message(MESSAGE_TEMPLATES["messages_cleared"], player=cleared_by, count=deleted_count)
        
        adventure_log.add_log_entry(
            room_id=room_id,
            message=log_message,
            log_type=LogType.SYSTEM,
            from_player=cleared_by
        )
        
        return {
            "success": True,
            "room_id": room_id,
            "deleted_count": deleted_count,
            "cleared_by": cleared_by
        }
        
    except Exception as e:
        print(f"❌ Error clearing system messages: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/game/{room_id}/colors")
async def update_seat_colors(room_id: str, request: dict):
    """Update seat colors for a game room"""
    try:
        check_room = GameService.get_room(id=room_id)
        if not check_room:
            raise HTTPException(status_code=404, detail=f"Room {room_id} not found")
        
        seat_colors = request.get("seat_colors")
        updated_by = request.get("updated_by")
        
        # Validate seat colors
        if not isinstance(seat_colors, dict):
            raise HTTPException(status_code=400, detail="Seat colors must be a dictionary")
        
        # Validate color format (basic hex color validation)
        for seat_index, color in seat_colors.items():
            if not isinstance(color, str) or not color.startswith('#') or len(color) != 7:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Invalid color format for seat {seat_index}: {color}"
                )
        
        # Update MongoDB record
        GameService.update_seat_colors(room_id, seat_colors)
        
        return {
            "success": True,
            "room_id": room_id,
            "seat_colors": seat_colors,
            "updated_by": updated_by
        }
        
    except HTTPException:
        raise  # Re-raise HTTP exceptions
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/game/{room_id}/logs")
async def clear_all_messages(room_id: str, request: dict):
    """Clear all adventure log messages"""
    try:
        check_room = GameService.get_room(id=room_id)
        if not check_room:
            raise HTTPException(status_code=404, detail=f"Room {room_id} not found")
        
        cleared_by = request.get("cleared_by", "Unknown")
        
        print(f"🧹 Clearing all messages for room {room_id} by {cleared_by}")
        
        # Clear all messages from the database
        deleted_count = adventure_log.clear_all_messages(room_id)
        
        print(f"✅ Cleared {deleted_count} total messages")
        
        # Add a log entry about the clearing action
        log_message = format_message(MESSAGE_TEMPLATES["messages_cleared"], player=cleared_by, count=deleted_count)
        
        adventure_log.add_log_entry(
            room_id=room_id,
            message=log_message,
            log_type=LogType.SYSTEM,
            from_player=cleared_by
        )
        
        return {
            "success": True,
            "room_id": room_id,
            "deleted_count": deleted_count,
            "cleared_by": cleared_by
        }
        
    except Exception as e:
        print(f"❌ Error clearing all messages: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# Register WebSocket routes - avoid circular dependencies
from websocket_handlers.app_websocket import register_websocket_routes
register_websocket_routes(app)
