# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later
from fastapi import FastAPI, Response
import logging

from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware

from gameservice import GameService, GameSettings
from adventure_log_service import AdventureLogService
from mapservice import MapService
from message_templates import format_message, MESSAGE_TEMPLATES
from models.log_type import LogType
from websocket_handlers.connection_manager import manager as connection_manager
from s3_client import s3_game_client

logger = logging.getLogger()
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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


# S3 Asset Management Endpoints (via api-site)
@app.get("/s3/assets")
async def list_game_assets(asset_type: str = None):
    """List all game assets from S3 bucket via api-site"""
    try:
        assets = s3_game_client.list_game_assets(asset_type)
        return assets
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/s3/assets/with-urls")
async def get_assets_with_urls(asset_type: str = None):
    """Get all game assets with presigned URLs via api-site"""
    try:
        assets = s3_game_client.get_assets_with_presigned_urls(asset_type)
        return assets
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/s3/assets/{object_key}")
async def get_asset_with_url(object_key: str):
    """Get a specific asset with presigned URL via api-site"""
    try:
        asset = s3_game_client.get_asset_with_presigned_url(object_key)
        if not asset:
            raise HTTPException(status_code=404, detail=f"Asset {object_key} not found")
        return asset
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/s3/assets/{object_key}/url")
async def get_presigned_url(object_key: str, expiry: int = None):
    """Generate a presigned URL for a specific asset via api-site"""
    try:
        url = s3_game_client.generate_presigned_url(object_key, expiry)
        if not url:
            raise HTTPException(status_code=404, detail=f"Asset {object_key} not found")
        return {"presigned_url": url, "expires_in": expiry or 3600}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/s3/health")
async def check_s3_health():
    """Check S3 bucket access and configuration via api-site"""
    try:
        health = s3_game_client.check_s3_health()
        return health
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Register WebSocket routes - avoid circular dependencies
from websocket_handlers.app_websocket import register_websocket_routes
register_websocket_routes(app)
