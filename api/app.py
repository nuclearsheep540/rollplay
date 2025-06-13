# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later
from fastapi import FastAPI, Response, WebSocket
from datetime import datetime
import time
import pydantic
import logging
from fastapi import HTTPException

from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from starlette.websockets import WebSocketDisconnect

from gameservice import GameService, GameSettings
from adventure_log_service import AdventureLogService
from message_templates import format_message, MESSAGE_TEMPLATES
from models.log_type import LogType
from connection_manager import ConnectionManager

logger = logging.getLogger()
app = FastAPI()
# app.add_middleware(HTTPSRedirectMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


manager = ConnectionManager()
adventure_log = AdventureLogService()


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
@app.put("/game/{room_id}/seats")
async def update_seat_count(room_id: str, request: dict):
    """Update the maximum number of seats for a game room"""
    try:
        check_room = GameService.get_room(id=room_id)
        max_players = request.get("max_players")
        updated_by = request.get("updated_by")
        
        # Validate seat count
        if not isinstance(max_players, int) or max_players < 1 or max_players > 8:
            raise HTTPException(status_code=400, detail="Seat count must be between 1 and 8")
        
        # FIXED: Pass room_id string, not check_room object
        GameService.update_seat_count(room_id, max_players)  # Changed from room_id=check_room
        
        return {
            "success": True,
            "room_id": room_id,
            "max_players": max_players,
            "updated_by": updated_by
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
            add_adventure_log(
                room_id=room_id,
                message=log_message,
                log_type=LogType.SYSTEM,
                player_name=updated_by
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
        
        add_adventure_log(
            room_id=room_id,
            message=log_message,
            log_type=LogType.SYSTEM,
            player_name=cleared_by
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
        
        add_adventure_log(
            room_id=room_id,
            message=log_message,
            log_type=LogType.SYSTEM,
            player_name=cleared_by
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






from websocket_events import WebsocketEvent
# Add these new event handlers to your app.py websocket_endpoint function
@app.websocket("/ws/{client_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    client_id: str,  # This should be your room_id
    player_name: str
):  
    # Broadcast connection event to all clients
    connect_message = WebsocketEvent.player_connection(
        manager=manager,
        websocket=websocket,
        client_id=client_id
    )
    await manager.update_data(connect_message)

    try:
        while True:
            data = await websocket.receive_json()
            event_type = data.get("event_type")
            event_data = data.get("data")

            if event_type == "seat_change":
                broadcast_message = WebsocketEvent.seat_change(
                    data=data,
                    player_name=player_name,
                    client_id=client_id,
                    manager=manager
                )

                # After seat change, update lobby
                await manager.broadcast_lobby_update(client_id)

            elif event_type == "dice_prompt":
                    broadcast_message = WebsocketEvent.dice_prompt(
                    data=data,
                    player_name=player_name,
                    client_id=client_id,
                    manager=manager
                )

            elif event_type == "initiative_prompt_all":
                if not event_data.get("players", []):
                    print("⚡ No players provided for initiative prompt")
                    continue

                broadcast_message = WebsocketEvent.initiative_prompt_all(
                    data=data,
                    player_name=player_name,
                    client_id=client_id,
                    manager=manager
                )

            # NEW: Handle clearing dice prompts
            elif event_type == "dice_prompt_clear":
                cleared_by = event_data.get("cleared_by", player_name)
                clear_all = event_data.get("clear_all", False)  # New: Support clearing all prompts
                prompt_id = event_data.get("prompt_id")  # New: Support clearing specific prompt by ID
                initiative_prompt_id = event_data.get("initiative_prompt_id")  # New: Initiative prompt ID for clear all
                
                # Remove adventure log entries for cancelled prompts
                log_removal_message = None
                if prompt_id:
                    # Remove specific prompt log entry
                    try:
                        deleted_count = adventure_log.remove_log_by_prompt_id(client_id, prompt_id)
                        if deleted_count > 0:
                            print(f"🗑️ Removed adventure log entry for cancelled prompt {prompt_id}")
                            
                            # Prepare log removal message
                            log_removal_message = {
                                "event_type": "adventure_log_removed",
                                "data": {
                                    "prompt_id": prompt_id,
                                    "removed_by": cleared_by
                                }
                            }
                    except Exception as e:
                        print(f"❌ Failed to remove adventure log for cancelled prompt {prompt_id}: {e}")
                elif clear_all and initiative_prompt_id:
                    # Remove initiative prompt log entry when clearing all
                    try:
                        deleted_count = adventure_log.remove_log_by_prompt_id(client_id, initiative_prompt_id)
                        if deleted_count > 0:
                            print(f"🗑️ Removed initiative prompt log entry {initiative_prompt_id}")
                            
                            # Prepare log removal message
                            log_removal_message = {
                                "event_type": "adventure_log_removed",
                                "data": {
                                    "prompt_id": initiative_prompt_id,
                                    "removed_by": cleared_by
                                }
                            }
                    except Exception as e:
                        print(f"❌ Failed to remove initiative prompt log {initiative_prompt_id}: {e}")
                
                if clear_all:
                    print(f"🎲 {cleared_by} cleared all dice prompts")
                elif prompt_id:
                    print(f"🎲 {cleared_by} cleared dice prompt {prompt_id}")
                else:
                    print(f"🎲 {cleared_by} cleared dice prompt")
                
                broadcast_message = {
                    "event_type": "dice_prompt_clear",
                    "data": {
                        "cleared_by": cleared_by,
                        "clear_all": clear_all,  # New: Include clear_all flag
                        "prompt_id": prompt_id   # New: Include specific prompt ID if provided
                    }
                }

            elif event_type == "combat_state":
                # Existing combat state logic...
                combat_active = event_data.get("combatActive", False)
                action = "started" if combat_active else "ended"
                
                template_key = "combat_started" if action == "started" else "combat_ended"
                log_message = format_message(MESSAGE_TEMPLATES[template_key], player=player_name)
                
                add_adventure_log(
                    room_id=client_id,
                    message=log_message,
                    log_type=LogType.SYSTEM,
                    player_name=player_name
                )
                
                broadcast_message = {
                    "event_type": "combat_state",
                    "data": event_data
                }

            elif event_type == "seat_count_change":
                # Handle seat count changes (no logging - not interesting for adventure log)
                broadcast_message = {
                    "event_type": "seat_count_change",
                    "data": event_data,
                    "player_name": player_name
                }

            elif event_type == "player_kicked":
                # Existing player kick logic...
                kicked_player = event_data.get("kicked_player")
                
                log_message = format_message(MESSAGE_TEMPLATES["player_kicked"], player=kicked_player)
                
                add_adventure_log(
                    room_id=client_id,
                    message=log_message,
                    log_type=LogType.SYSTEM,
                    player_name=player_name
                )
                
                broadcast_message = {
                    "event_type": "player_kicked",
                    "data": event_data,
                    "player_name": player_name
                }

            elif event_type == "dice_roll":
                # Frontend sends pre-formatted message
                roll_data = event_data
                player = roll_data.get("player")
                formatted_message = roll_data.get("message")  # Pre-formatted by frontend
                prompt_id = roll_data.get("prompt_id")
                
                add_adventure_log(
                    room_id=client_id,
                    message=formatted_message,
                    log_type=LogType.PLAYER_ROLL, 
                    player_name=player
                )
                
                if prompt_id:
                    print(f"🎲 {formatted_message} (completing prompt {prompt_id})")
                else:
                    print(f"🎲 {formatted_message}")
                
                broadcast_message = {
                    "event_type": "dice_roll",
                    "data": {
                        **event_data  # Frontend sends everything we need
                    }
                }
                
                # Auto-clear prompt if this was a prompted roll (has prompt_id or player)
                clear_prompt_message = None
                log_removal_message = None
                if prompt_id:
                    # Remove the adventure log entry for this prompt
                    try:
                        deleted_count = adventure_log.remove_log_by_prompt_id(client_id, prompt_id)
                        if deleted_count > 0:
                            print(f"🗑️ Removed adventure log entry for completed prompt {prompt_id}")
                            
                            # Prepare log removal message to send after dice roll
                            log_removal_message = {
                                "event_type": "adventure_log_removed",
                                "data": {
                                    "prompt_id": prompt_id,
                                    "removed_by": "system"
                                }
                            }
                    except Exception as e:
                        print(f"❌ Failed to remove adventure log for prompt {prompt_id}: {e}")
                    
                    clear_prompt_message = {
                        "event_type": "dice_prompt_clear",
                        "data": {
                            "cleared_by": "system",
                            "auto_cleared": True,
                            "prompt_id": prompt_id  # Clear specific prompt by ID
                        }
                    }
                elif player:
                    # For initiative prompts, clear by player name since we might not have exact prompt_id
                    clear_prompt_message = {
                        "event_type": "dice_prompt_clear",
                        "data": {
                            "cleared_by": "system", 
                            "auto_cleared": True,
                            "cleared_player": player  # Clear prompts for this player
                        }
                    }
                # We'll send this after the dice roll broadcast
            
            elif event_type == "clear_system_messages":
                # Existing clear system messages logic...
                cleared_by = event_data.get("cleared_by", player_name)
                
                try:
                    deleted_count = adventure_log.clear_system_messages(client_id)
                    
                    log_message = format_message(MESSAGE_TEMPLATES["messages_cleared"], player=cleared_by, count=deleted_count)
                    
                    add_adventure_log(
                        room_id=client_id,
                        message=log_message,
                        log_type=LogType.SYSTEM,
                        player_name=cleared_by
                    )
                    
                    print(f"🧹 {cleared_by} cleared {deleted_count} system messages from room {client_id}")
                    
                    broadcast_message = {
                        "event_type": "system_messages_cleared",
                        "data": {
                            "deleted_count": deleted_count,
                            "cleared_by": cleared_by
                        }
                    }
                    
                except Exception as e:
                    error_msg = f"Failed to clear system messages: {str(e)}"
                    print(f"❌ {error_msg}")
                    
                    error_message = {
                        "event_type": "error",
                        "data": error_msg
                    }
                    await websocket.send_json(error_message)
                    continue
            
            elif event_type == "clear_all_messages":
                # Clear all adventure log messages
                cleared_by = event_data.get("cleared_by", player_name)
                
                try:
                    deleted_count = adventure_log.clear_all_messages(client_id)
                    
                    log_message = format_message(MESSAGE_TEMPLATES["messages_cleared"], player=cleared_by, count=deleted_count)
                    
                    add_adventure_log(
                        room_id=client_id,
                        message=log_message,
                        log_type=LogType.SYSTEM,
                        player_name=cleared_by
                    )
                    
                    print(f"🧹 {cleared_by} cleared {deleted_count} total messages from room {client_id}")
                    
                    broadcast_message = {
                        "event_type": "all_messages_cleared",
                        "data": {
                            "deleted_count": deleted_count,
                            "cleared_by": cleared_by
                        }
                    }
                    
                except Exception as e:
                    error_msg = f"Failed to clear all messages: {str(e)}"
                    print(f"❌ {error_msg}")
                    
                    error_message = {
                        "event_type": "error",
                        "data": error_msg
                    }
                    await websocket.send_json(error_message)
                    continue

            elif event_type == "color_change":
                # Handle player color changes
                player_changing = event_data.get("player")
                seat_index = event_data.get("seat_index")
                new_color = event_data.get("new_color")
                changed_by = event_data.get("changed_by", player_name)
                
                if not all([player_changing, seat_index is not None, new_color]):
                    error_message = {
                        "event_type": "error",
                        "data": "Color change requires player, seat_index, and new_color"
                    }
                    await websocket.send_json(error_message)
                    continue
                
                try:
                    # Get current seat colors
                    current_colors = GameService.get_seat_colors(client_id)
                    
                    # Update the specific seat color
                    current_colors[str(seat_index)] = new_color
                    
                    # Persist to database
                    GameService.update_seat_colors(client_id, current_colors)
                    
                    print(f"🎨 {changed_by} changed {player_changing}'s color (seat {seat_index}) to {new_color}")
                    
                    broadcast_message = {
                        "event_type": "color_change",
                        "data": {
                            "player": player_changing,
                            "seat_index": seat_index,
                            "new_color": new_color,
                            "changed_by": changed_by
                        }
                    }
                    
                except Exception as e:
                    error_msg = f"Failed to update seat color: {str(e)}"
                    print(f"❌ {error_msg}")
                    
                    error_message = {
                        "event_type": "error",
                        "data": error_msg
                    }
                    await websocket.send_json(error_message)
                    continue

            else:
                # Chat messages - frontend sends pre-formatted
                timestamp = datetime.now().strftime("%H:%M")
                
                add_adventure_log(
                    room_id=client_id,
                    message=data.get("data", ""),
                    log_type=LogType.CHAT, 
                    player_name=player_name
                )
                
                await manager.update_data({
                    **data, 
                    "player_name": player_name, 
                    "utc_timestamp": timestamp
                })
                continue
            
            # Broadcast the main message
            await manager.update_data(broadcast_message)
            
            # Handle special cases for adventure log removal
            if event_type == "dice_roll":
                import asyncio
                await asyncio.sleep(0.5)  # Small delay to ensure dice roll is processed first
                
                # Send log removal message first
                if log_removal_message:
                    await manager.update_data_for_room(client_id, log_removal_message)
                
                # Then send prompt clear message
                if clear_prompt_message:
                    await manager.update_data(clear_prompt_message)
            
            elif event_type == "dice_prompt_clear":
                # Send log removal message for cancelled prompts (no delay needed)
                if log_removal_message:
                    await manager.update_data_for_room(client_id, log_removal_message)
            
    except WebSocketDisconnect:
        # Server-side disconnect handling with seat cleanup
        log_message = format_message(MESSAGE_TEMPLATES["player_disconnected"], player=player_name)
        
        add_adventure_log(
            room_id=client_id,
            message=log_message,
            log_type=LogType.SYSTEM,
            player_name=player_name
        )
        
        manager.remove_connection(websocket, client_id, player_name)
        
        # Clean up disconnected player's seat
        current_seats = GameService.get_seat_layout(client_id)
        
        # Remove disconnected player from their seat (case-insensitive)
        updated_seats = []
        for seat in current_seats:
            if seat.lower() == player_name.lower():
                updated_seats.append("empty")
            else:
                updated_seats.append(seat)
        
        # Update seat layout in database
        GameService.update_seat_layout(client_id, updated_seats)
        
        # Send lobby update after disconnect (will show user as disconnecting)
        await manager.broadcast_lobby_update(client_id)
        
        # Broadcast player disconnection event
        disconnect_message = {
            "event_type": "player_disconnected", 
            "data": {
                "disconnected_player": player_name
            }
        }
        await manager.update_data(disconnect_message)
        
        # Broadcast updated seat layout to all remaining clients
        seat_change_message = {
            "event_type": "seat_change",
            "data": updated_seats
        }
        await manager.update_data(seat_change_message)

