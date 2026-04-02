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

from gameservice import GameService, GameSettings, DEFAULT_SEAT_COLORS
from adventure_log_service import AdventureLogService
from mapservice import MapService, MapSettings
from imageservice import ImageService, ImageSettings
from message_templates import format_message, MESSAGE_TEMPLATES
from models.log_type import LogType
from websocket_handlers.connection_manager import manager as connection_manager
from shared_contracts.session import (
    SessionStartPayload,
    SessionStartResponse,
    SessionEndFinalState,
    SessionEndResponse,
    PlayerState,
    SessionStats,
)
from shared_contracts.map import MapConfig
from shared_contracts.image import ImageConfig
from schemas.session_schemas import SessionEndRequest
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
image_service = ImageService()


def build_role_change_payload(room_id: str, action: str, target_user_id: str, changed_by: str, message: str) -> dict:
    room = GameService.get_room(id=room_id) or {}
    return {
        "event_type": "role_change",
        "data": {
            "action": action,
            "target_player": target_user_id,
            "changed_by": changed_by,
            "message": message,
            "dungeon_master": room.get("dungeon_master", {}),
            "player_metadata": room.get("player_metadata", {}),
        }
    }


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
            mc = active_map.get('map_config', {})
            logger.info(f"HTTP endpoint returning active map for room {room_id}: {mc.get('filename')} with grid_config: {mc.get('grid_config')}")
            return {"active_map": active_map}
        else:
            logger.info(f"HTTP endpoint: No active map found for room {room_id}")
            raise HTTPException(status_code=404, detail="No active map found for this room")
            
    except Exception as e:
        logger.error(f"Error getting active map for room {room_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/game/{room_id}/active-image")
async def get_active_image(room_id: str):
    """Get the currently active image for a room"""
    try:
        active_image = image_service.get_active_image(room_id)
        active_display = image_service.get_active_display(room_id)

        if active_image:
            logger.info(f"HTTP endpoint returning active image for room {room_id}: {active_image.get('image_config', {}).get('filename')}")
            return {"active_image": active_image, "active_display": active_display}
        else:
            logger.info(f"HTTP endpoint: No active image found for room {room_id}")
            return {"active_image": None, "active_display": active_display}

    except Exception as e:
        logger.error(f"Error getting active image for room {room_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/game/{room_id}/map")
async def update_map(room_id: str, request: dict):
    """Update complete map object - server authoritative atomic update"""
    try:
        updated_map = request.get("map")
        updated_by = request.get("updated_by", "unknown")

        mc = updated_map.get("map_config", {}) if updated_map else {}
        filename = mc.get("filename")

        if not updated_map or not filename:
            raise HTTPException(status_code=400, detail="Complete map object with map_config.filename is required")

        # Replace entire map in database (atomic)
        logger.info(f"HTTP: Updating complete map for room {room_id}, filename {filename} by {updated_by}")
        success = map_service.update_complete_map(room_id, updated_map)

        if success:
            # Get the updated map to broadcast via WebSocket
            updated_map_result = map_service.get_active_map(room_id)

            if updated_map_result:
                result_mc = updated_map_result.get("map_config", {})
                # Broadcast flat delta to all clients via WebSocket
                map_update_message = {
                    "event_type": "map_config_update",
                    "data": {
                        "filename": filename,
                        "grid_config": result_mc.get("grid_config"),
                        "map_image_config": result_mc.get("map_image_config"),
                        "updated_by": updated_by
                    }
                }

                # Broadcast to all connected clients in this room
                await connection_manager.update_room_data(room_id, map_update_message)

                logger.info(f"HTTP: Complete map updated and broadcasted for room {room_id}")
                return {"success": True, "updated_map": updated_map_result}
            else:
                logger.warning(f"HTTP: Map updated but could not retrieve updated map")
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
            displaced_user_id = displaced_player.get("userId")
            if displaced_user_id:
                try:
                    logger.info(f"Moving {displaced_user_id} from seat {displaced_player.get('seatId')} to lobby")

                    # Update player's party status in ConnectionManager
                    await connection_manager.remove_player_from_party(room_id, displaced_user_id)

                    # Send displacement notification to the player
                    displacement_message = {
                        "event_type": "player_displaced",
                        "data": {
                            "user_id": displaced_user_id,
                            "reason": "seat_reduction",
                            "message": "You have been moved to the lobby due to seat count reduction",
                            "former_seat": displaced_player.get("seatId", "unknown")
                        }
                    }
                    await connection_manager.send_to_player(room_id, displaced_user_id, displacement_message)

                    # Log displacement to adventure log
                    log_message = f"{displaced_user_id} was moved to lobby due to seat reduction"
                    adventure_log.add_log_entry(
                        room_id=room_id,
                        message=log_message,
                        log_type=LogType.SYSTEM,
                        from_player="System"
                    )

                except Exception as e:
                    logger.error(f"Error handling displaced player {displaced_user_id}: {str(e)}")
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
                    was_displaced = any(dp.get("userId") == player_in_seat for dp in displaced_players)
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
            logger.info(f"Seat count updated successfully to {max_players}, displaced {len(displaced_players)} players")
        except Exception as e:
            logger.warning(f"Error broadcasting seat count change: {str(e)}")
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
        # Include active_map and active_image so the client gets asset URLs in the
        # first response, eliminating separate round trips on initial page load.
        # The server component uses these for <link rel="preload"> hints.
        active_map = map_service.get_active_map(room_id)
        active_image = image_service.get_active_image(room_id)
        return {
            **check_room,
            "current_seat_layout": seat_layout,
            "seat_colors": seat_colors,
            "active_map": active_map,
            "active_image": active_image,
        }
    else:
        return Response(status_code=404, content=f'{{"error": "Room {room_id} not found"}}')

@app.get("/game/{room_id}/roles")
def get_player_roles(room_id: str, userId: str):
    """Check user's roles (moderator, DM) in a room"""
    try:
        check_room = GameService.get_room(id=room_id)
        if not check_room:
            raise HTTPException(status_code=404, detail=f"Room {room_id} not found")

        is_moderator = GameService.is_moderator(room_id, userId)
        is_dm = GameService.is_dm(room_id, userId)

        return {
            "is_host": is_dm,  # host = DM for backward compat
            "is_moderator": is_moderator,
            "is_dm": is_dm
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/game/{room_id}/moderators")
async def add_moderator(room_id: str, request: dict):
    """Add a user as moderator — proxies to api-site for domain validation."""
    try:
        check_room = GameService.get_room(id=room_id)
        if not check_room:
            raise HTTPException(status_code=404, detail=f"Room {room_id} not found")

        user_id = request.get("user_id")
        requesting_user_id = request.get("requesting_user_id")
        if not user_id or not requesting_user_id:
            raise HTTPException(status_code=400, detail="user_id and requesting_user_id are required")

        # Hot-state check: target must not be seated
        seat_layout = check_room.get("seat_layout", [])
        if user_id in [s for s in seat_layout if s != "empty"]:
            raise HTTPException(status_code=409, detail="Seated players cannot be moderators")

        # Ask api-site (domain authority) for permission
        import site_client
        campaign_id = check_room.get("campaign_id", "")
        await site_client.request_role_change(campaign_id, requesting_user_id, user_id, "mod")

        # api-site approved — update hot state
        GameService.update_player_role(room_id, user_id, "mod")

        role_change_message = build_role_change_payload(
            room_id, "add_moderator", user_id, requesting_user_id,
            f"Added as moderator",
        )
        await connection_manager.update_room_data(room_id, role_change_message)
        return {"success": True, "message": f"{user_id} added as moderator"}

    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to add moderator: {e}")
        raise HTTPException(status_code=502, detail=str(e))

@app.delete("/game/{room_id}/moderators")
async def remove_moderator(room_id: str, request: dict):
    """Remove a user from moderators — proxies to api-site for domain validation."""
    try:
        check_room = GameService.get_room(id=room_id)
        if not check_room:
            raise HTTPException(status_code=404, detail=f"Room {room_id} not found")

        user_id = request.get("user_id")
        requesting_user_id = request.get("requesting_user_id")
        if not user_id or not requesting_user_id:
            raise HTTPException(status_code=400, detail="user_id and requesting_user_id are required")

        # Ask api-site (domain authority) for permission
        import site_client
        campaign_id = check_room.get("campaign_id", "")
        await site_client.request_role_change(campaign_id, requesting_user_id, user_id, "spectator")

        # api-site approved — update hot state
        GameService.update_player_role(room_id, user_id, "spectator")

        role_change_message = build_role_change_payload(
            room_id, "remove_moderator", user_id, requesting_user_id,
            f"Removed from moderators",
        )
        await connection_manager.update_room_data(room_id, role_change_message)
        return {"success": True, "message": f"{user_id} removed from moderators"}

    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to remove moderator: {e}")
        raise HTTPException(status_code=502, detail=str(e))

@app.post("/game/{room_id}/dm")
async def set_dm(room_id: str, request: dict):
    """Set a user as dungeon master"""
    try:
        check_room = GameService.get_room(id=room_id)
        if not check_room:
            raise HTTPException(status_code=404, detail=f"Room {room_id} not found")

        user_id = request.get("user_id")
        if not user_id:
            raise HTTPException(status_code=400, detail="user_id is required")

        # Resolve player_name from hot-state metadata or request
        player_metadata = check_room.get("player_metadata", {})
        meta = player_metadata.get(user_id, {}) if isinstance(player_metadata, dict) else {}
        player_name = request.get("player_name") or meta.get("player_name", "")

        success = GameService.set_dm(room_id, user_id, player_name)
        if success:
            role_change_message = build_role_change_payload(
                room_id,
                "set_dm",
                user_id,
                "System",
                f"{user_id} has been set as Dungeon Master",
            )
            await connection_manager.update_room_data(room_id, role_change_message)

            return {"success": True, "message": f"{user_id} set as Dungeon Master"}
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
        
        # Get current DM user_id before removing
        current_dm = check_room.get("dungeon_master", {}).get("user_id", "")

        success = GameService.unset_dm(room_id)
        if success:
            # Broadcast role change event to all clients in the room
            role_change_message = build_role_change_payload(
                room_id,
                "unset_dm",
                current_dm,
                "System",
                "Dungeon Master role has been removed",
            )
            await connection_manager.update_room_data(room_id, role_change_message)
            
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
async def create_session(request: SessionStartPayload):
    """
    Create MongoDB active game for a session.

    This endpoint is called by api-site when starting a session.
    It creates a minimal game with empty seats that players fill during gameplay.

    Request:
    {
        "session_id": "550e8400-e29b-41d4-a716-446655440000",
        "dm_user_id": "uuid-of-dm",
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

        def get_default_color(index):
            return DEFAULT_SEAT_COLORS[index] if index < len(DEFAULT_SEAT_COLORS) else DEFAULT_SEAT_COLORS[0]

        # Convert assets to dict format for MongoDB storage
        available_assets = [asset.model_dump() for asset in request.assets] if request.assets else []

        # Key player_metadata by user_id — campaign_role lives on each entry
        player_metadata = {}
        if request.session_users:
            for session_user in request.session_users:
                # Flatten: top-level identity + character fields (if present)
                entry = {
                    "user_id": session_user.user_id,
                    "player_name": session_user.player_name,
                    "campaign_role": session_user.campaign_role,
                }
                if session_user.character:
                    entry.update(session_user.character.model_dump())
                player_metadata[session_user.user_id] = entry

        # Create minimal session
        settings = GameSettings(
            max_players=request.max_players,
            seat_layout=["empty"] * request.max_players,
            seat_colors={str(i): get_default_color(i) for i in range(request.max_players)},
            created_at=datetime.utcnow(),
            dungeon_master=request.dungeon_master.model_dump(),
            available_assets=available_assets,
            campaign_id=request.campaign_id,
            player_metadata=player_metadata,
            audio_state={k: v.model_dump() for k, v in request.audio_config.items()} if request.audio_config else {},
            audio_track_config={k: v.model_dump() for k, v in request.audio_track_config.items()} if request.audio_track_config else {}
        )

        # Use session_id as MongoDB _id (back-reference to PostgreSQL session)
        game_id = GameService.create_room(settings, room_id=request.session_id)

        logger.info(f"Created game {game_id} for session {request.session_id} with {len(request.joined_user_ids)} joined players")

        # Restore map from previous session if available
        if request.map_config and request.map_config.filename:
            try:
                map_config = request.map_config
                restored_map = MapSettings(
                    room_id=request.session_id,
                    uploaded_by="system",
                    map_config=map_config,
                )
                map_service.set_active_map(request.session_id, restored_map)
                logger.info(f"Restored map '{map_config.filename}' for session {request.session_id}")
            except Exception as e:
                logger.warning(f"Map restoration failed (non-fatal): {e}")

        # Restore image from previous session if available
        if request.image_config and request.image_config.filename:
            try:
                image_config = request.image_config
                restored_image = ImageSettings(
                    room_id=request.session_id,
                    loaded_by="system",
                    image_config=image_config,
                )
                image_service.set_active_image(request.session_id, restored_image)
                logger.info(f"Restored image '{image_config.filename}' for session {request.session_id}")
            except Exception as e:
                logger.warning(f"Image restoration failed (non-fatal): {e}")

        # Restore active_display from previous session
        if request.active_display:
            try:
                GameService.set_active_display(request.session_id, request.active_display)
                logger.info(f"Restored active_display '{request.active_display}' for session {request.session_id}")
            except Exception as e:
                logger.warning(f"active_display restoration failed (non-fatal): {e}")

        return SessionStartResponse(
            success=True,
            session_id=game_id,  # Return MongoDB document ID as session_id for api-site
            message="Game created successfully for session"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create session: {e}")
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

        # Extract player data from seat_layout (seats now contain user_ids)
        player_metadata = room.get("player_metadata", {})
        players = []
        for idx, seat in enumerate(room.get("seat_layout", [])):
            if seat != "empty":
                # Look up display name from player_metadata
                meta = player_metadata.get(seat, {}) if isinstance(player_metadata, dict) else {}
                display_name = meta.get("player_name", seat)
                players.append(PlayerState(
                    user_id=seat,
                    player_name=display_name,
                    seat_position=idx,
                    seat_color=room.get("seat_colors", {}).get(str(idx), "")
                ))

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

        # Get active map state for ETL — contract data is nested under map_config
        active_map = map_service.get_active_map(request.session_id)
        map_state = None
        if active_map and active_map.get("map_config", {}).get("filename"):
            map_state = MapConfig(**active_map["map_config"])

        # Get active image state for ETL — contract data is nested under image_config
        active_image = image_service.get_active_image(request.session_id)
        image_state = None
        if active_image and active_image.get("image_config", {}).get("filename"):
            image_state = ImageConfig(**active_image["image_config"])

        # Get active_display from game session
        active_display = image_service.get_active_display(request.session_id)

        # Build final state — extract __master_volume from audio_state (it's a float,
        # not an AudioChannelState) before passing to the typed contract
        raw_audio_state = dict(room.get("audio_state", {}))
        broadcast_master_volume = raw_audio_state.pop("__master_volume", None)
        final_state = SessionEndFinalState(
            players=players,
            session_stats=SessionStats(
                duration_minutes=duration_minutes,
                total_logs=log_count,
                max_players=room.get("max_players", 0),
            ),
            audio_state=raw_audio_state,
            audio_track_config=room.get("audio_track_config", {}),
            broadcast_master_volume=broadcast_master_volume,
            map_state=map_state,
            image_state=image_state,
            active_display=active_display,
        )

        # If not validate_only, delete the game (deprecated flow)
        if not validate_only:
            logger.warning(f"Using deprecated delete flow for session {request.session_id}")
            GameService.delete_room(request.session_id)

        logger.info(f"Returned final state for session {request.session_id} (validate_only={validate_only})")

        return SessionEndResponse(
            success=True,
            final_state=final_state,
            message="Final state retrieved" if validate_only else "Session ended"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to end session: {e}")
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
            logger.info(f"Session {game_id} already deleted")
            return {
                "success": True,
                "message": "Session already deleted"
            }

        # Gracefully disconnect all WebSocket clients before deletion
        logger.info(f"Closing WebSocket connections for room {game_id}")
        await connection_manager.close_room_connections(game_id, reason="Session ended")

        # Delete active_session from MongoDB
        GameService.delete_room(game_id)

        # Optionally delete logs and maps
        if not keep_logs:
            logger.info(f"Deleting logs, maps, and images for {game_id}")
            adventure_log.delete_room_logs(game_id)
            map_service.clear_active_map(game_id)
            image_service.clear_active_image(game_id)

        logger.info(f"Deleted session {game_id} (keep_logs={keep_logs})")

        return {
            "success": True,
            "message": "Session deleted successfully"
        }

    except Exception as e:
        logger.error(f"Failed to delete session {game_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/game/{room_id}/player/character")
async def update_player_character(room_id: str, character_data: dict):
    """
    Update a player's character data in the session.

    Called by api-site when a player changes their character mid-session.
    Updates room player_metadata with character information.

    Request:
    {
        "player_name": "username",
        "user_id": "uuid",
        "character_id": "uuid",
        "character_name": "Aragorn",
        "character_class": ["Ranger"],
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

        # Update the character in room metadata
        GameService.update_player_character(room_id, character_data)

        # Broadcast character change to all clients via WebSocket
        player_name = character_data.get("player_name", "unknown")
        character_name = character_data.get("character_name", "unknown")

        change_message = {
            "event_type": "player_character_changed",
            "data": {
                "user_id": character_data.get("user_id"),
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
        logger.info(f"Updated character for {player_name} to {character_name} in room {room_id}")

        return {
            "success": True,
            "message": "Character updated successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update character: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/game/{room_id}/seat-layout")
async def update_seat_layout(room_id: str, request: dict):
    """Update the seat layout for a game room"""
    try:
        logger.debug(f"Received seat layout update request for room {room_id}")
        logger.debug(f"Request data: {request}")

        check_room = GameService.get_room(id=room_id)
        if not check_room:
            logger.error(f"Room {room_id} not found")
            raise HTTPException(status_code=404, detail=f"Room {room_id} not found")

        seat_layout = request.get("seat_layout")
        updated_by = request.get("updated_by", "System")

        logger.debug(f"Updated by: {updated_by}")
        logger.debug(f"New seat layout: {seat_layout}")
        
        # Validate seat layout
        if not isinstance(seat_layout, list):
            logger.error(f"Invalid seat layout type: {type(seat_layout)}")
            raise HTTPException(status_code=400, detail="Seat layout must be an array")

        # Get current max_players to validate layout length
        current_max = check_room.get("max_players", 4)
        if len(seat_layout) > current_max:
            logger.error(f"Seat layout too long: {len(seat_layout)} > {current_max}")
            raise HTTPException(
                status_code=400, 
                detail=f"Seat layout cannot exceed {current_max} seats"
            )

        non_empty_players = [seat for seat in seat_layout if isinstance(seat, str) and seat != "empty"]

        room_dm = check_room.get("dungeon_master", {}).get("user_id", "")
        if room_dm and room_dm in non_empty_players:
            raise HTTPException(status_code=409, detail="Dungeon Master cannot sit in party seats")

        player_metadata = check_room.get("player_metadata", {})
        if not isinstance(player_metadata, dict):
            player_metadata = {}

        seated_mods = [
            uid for uid in non_empty_players
            if player_metadata.get(uid, {}).get("campaign_role") == "mod"
        ]
        if seated_mods:
            raise HTTPException(status_code=409, detail="Moderators cannot sit in party seats")

        invalid_players = [
            uid for uid in non_empty_players
            if not player_metadata.get(uid, {}).get("character_id")
        ]
        if invalid_players:
            raise HTTPException(
                status_code=409,
                detail="Only adventurers with selected characters can sit in party seats",
            )
        
        # Update MongoDB record
        logger.debug(f"Calling GameService.update_seat_layout({room_id}, {seat_layout})")
        GameService.update_seat_layout(room_id, seat_layout)
        logger.info(f"Successfully saved seat layout to database")
        
        # Log the change (only if there are actual players)
        non_empty_seats = [seat for seat in seat_layout if seat != "empty"]
        if non_empty_seats:  # Only log if there are actual players
            player_list = ", ".join(non_empty_seats)
            
            log_message = format_message(MESSAGE_TEMPLATES["party_updated"], players=", ".join(non_empty_seats))

            logger.debug(f"Adding adventure log: {log_message}")
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
        logger.debug(f"Returning response: {response_data}")
        return response_data

    except HTTPException:
        raise  # Re-raise HTTP exceptions
    except ValueError as e:
        logger.warning(f"Seat layout validation failed: {str(e)}")
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error in update_seat_layout: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    
@app.delete("/game/{room_id}/logs/system")
async def clear_system_messages(room_id: str, request: dict):
    """Clear all system messages from the adventure log"""
    try:
        check_room = GameService.get_room(id=room_id)
        if not check_room:
            raise HTTPException(status_code=404, detail=f"Room {room_id} not found")
        
        cleared_by = request.get("cleared_by", "Unknown")

        logger.info(f"Clearing system messages for room {room_id} by {cleared_by}")

        # Clear system messages from the database
        deleted_count = adventure_log.clear_system_messages(room_id)

        logger.info(f"Cleared {deleted_count} system messages")
        
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
        logger.error(f"Error clearing system messages: {str(e)}")
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

        logger.info(f"Clearing all messages for room {room_id} by {cleared_by}")

        # Clear all messages from the database
        deleted_count = adventure_log.clear_all_messages(room_id)

        logger.info(f"Cleared {deleted_count} total messages")
        
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
        logger.error(f"Error clearing all messages: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# Register WebSocket routes - avoid circular dependencies
from websocket_handlers.app_websocket import register_websocket_routes
register_websocket_routes(app)
