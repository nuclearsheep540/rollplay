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
from adventure_log_service import create_adventure_log_service

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

adventure_log_service = create_adventure_log_service()

# Helper function to add log entries
def add_adventure_log(room_id: str, message: str, log_type: str, player_name: str = None):
    """Helper function to add log entries with your default settings"""
    try:
        return adventure_log_service.add_log_entry(
            room_id=room_id,
            message=message,
            log_type=log_type,
            player_name=player_name,
            max_logs=200
        )
    except Exception as e:
        print(f"Failed to add adventure log: {e}")
        return None

class Message(pydantic.BaseModel):
    "A standard string message response"
#    We use the pydantic BaseModel because Fast uses 
#    pydantic validation OOTB, this ensures validation on this Type.
    msg: str

@app.get("/game/{room_id}/logs")
async def get_room_logs(room_id: str, limit: int = 100, skip: int = 0):
    """Get adventure logs for a room"""
    try:
        logs = adventure_log_service.get_room_logs(room_id, limit, skip)
        count = adventure_log_service.get_room_log_count(room_id)
        
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
        stats = adventure_log_service.get_room_stats(room_id)
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
        # Add current seat layout to response
        seat_layout = GameService.get_seat_layout(room_id)
        return {
            **check_room,
            "current_seat_layout": seat_layout
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
            print(f"📜 Adding adventure log: Party updated: {player_list}")
            add_adventure_log(
                room_id=room_id,
                message=f"Party updated: {player_list}",
                log_type="system",
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
        deleted_count = adventure_log_service.clear_system_messages(room_id)
        
        print(f"✅ Cleared {deleted_count} system messages")
        
        # Add a log entry about the clearing action
        add_adventure_log(
            room_id=room_id,
            message=f"System messages cleared by {cleared_by}",
            log_type="system",
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
        deleted_count = adventure_log_service.clear_all_messages(room_id)
        
        print(f"✅ Cleared {deleted_count} total messages")
        
        # Add a log entry about the clearing action
        add_adventure_log(
            room_id=room_id,
            message=f"All adventure log messages cleared by {cleared_by}",
            log_type="system",
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

class ConnectionManager:
    def __init__(self):
        self.connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.connections.append(websocket)

    def remove_connection(self, websocket: WebSocket):
        """Remove a disconnected websocket from the connections list"""
        if websocket in self.connections:
            self.connections.remove(websocket)

    async def update_data(self, data):
        """Send data to all connected clients, removing any dead connections"""
        dead_connections = []
        
        for connection in self.connections:
            try:
                await connection.send_json(data=data)
            except Exception:
                # Mark this connection as dead
                dead_connections.append(connection)
        
        # Remove all dead connections
        for dead_connection in dead_connections:
            self.remove_connection(dead_connection)

manager = ConnectionManager()


# Add these new event handlers to your app.py websocket_endpoint function

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    client_id: str,  # This should be your room_id
    player_name: str
):
    # Normalize player name to lowercase for consistent identification
    player_name = player_name.lower()
    await manager.connect(websocket)

    # Log player connection to database
    add_adventure_log(
        room_id=client_id,
        message=f"{player_name} connected",
        log_type="system",
        player_name=player_name
    )
    
    # Broadcast connection event to all clients
    connect_message = {
        "event_type": "player_connected", 
        "data": {
            "connected_player": player_name
        }
    }
    await manager.update_data(connect_message)
  
    try:
        while True:
            data = await websocket.receive_json()
            event_type = data.get("event_type")
            event_data = data.get("data")

            if event_type == "seat_change":
                # Existing seat change logic...
                seat_layout = data.get("data")
                player_name_from_event = data.get("player_name", player_name)
                
                if not isinstance(seat_layout, list):
                    error_message = {
                        "event_type": "error",
                        "data": "Seat layout must be an array."
                    }
                    await websocket.send_json(error_message)
                    continue

                print(f"📡 Broadcasting seat layout change for room {client_id}: {seat_layout}")
                
                broadcast_message = {
                    "event_type": "seat_change",
                    "data": seat_layout,
                    "player_name": player_name_from_event
                }

            # NEW: Handle dice prompts
            elif event_type == "dice_prompt":
                prompted_player = event_data.get("prompted_player")
                roll_type = event_data.get("roll_type")
                prompted_by = event_data.get("prompted_by", player_name)
                prompt_id = event_data.get("prompt_id")  # New: Get prompt ID
                
                # Log the prompt to adventure log
                add_adventure_log(
                    room_id=client_id,
                    message=f"DM: {prompted_player}, please roll a {roll_type}",
                    log_type="dice",
                    player_name=prompted_by
                )
                
                print(f"🎲 {prompted_by} prompted {prompted_player} to roll {roll_type} (prompt_id: {prompt_id})")
                
                broadcast_message = {
                    "event_type": "dice_prompt",
                    "data": {
                        "prompted_player": prompted_player,
                        "roll_type": roll_type,
                        "prompted_by": prompted_by,
                        "prompt_id": prompt_id  # New: Include prompt ID in broadcast
                    }
                }

            # NEW: Handle collective initiative prompting
            elif event_type == "initiative_prompt_all":
                players_to_prompt = event_data.get("players", [])
                prompted_by = event_data.get("prompted_by", player_name)
                
                if not players_to_prompt:
                    print("⚡ No players provided for initiative prompt")
                    continue
                
                # Log ONE adventure log entry for the collective action
                player_names = ", ".join(players_to_prompt)
                add_adventure_log(
                    room_id=client_id,
                    message=f"DM prompted all players for Initiative: {player_names}",
                    log_type="system",
                    player_name=prompted_by
                )
                
                print(f"⚡ {prompted_by} prompted all players for initiative: {player_names}")
                
                # Single broadcast with player list - clients check if they're in the list
                broadcast_message = {
                    "event_type": "initiative_prompt_all",
                    "data": {
                        "players_to_prompt": players_to_prompt,
                        "roll_type": "Initiative",
                        "prompted_by": prompted_by,
                        "prompt_id": f"initiative_all_{int(time.time() * 1000)}"
                    }
                }

            # NEW: Handle clearing dice prompts
            elif event_type == "dice_prompt_clear":
                cleared_by = event_data.get("cleared_by", player_name)
                clear_all = event_data.get("clear_all", False)  # New: Support clearing all prompts
                prompt_id = event_data.get("prompt_id")  # New: Support clearing specific prompt by ID
                
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
                action = "initiated" if combat_active else "ended"
                
                add_adventure_log(
                    room_id=client_id,
                    message=f"Combat {action}",
                    log_type="system",
                    player_name=player_name
                )
                
                broadcast_message = {
                    "event_type": "combat_state",
                    "data": event_data
                }

            elif event_type == "seat_count_change":
                # Existing seat count logic...
                max_players = event_data.get("max_players")
                updated_by = event_data.get("updated_by")
                
                add_adventure_log(
                    room_id=client_id,
                    message=f"{updated_by} changed party size to {max_players} seats",
                    log_type="system",
                    player_name=updated_by
                )
                
                broadcast_message = {
                    "event_type": "seat_count_change",
                    "data": event_data,
                    "player_name": player_name
                }

            elif event_type == "player_kicked":
                # Existing player kick logic...
                kicked_player = event_data.get("kicked_player")
                
                add_adventure_log(
                    room_id=client_id,
                    message=f"{kicked_player} was removed from the game",
                    log_type="system",
                    player_name=player_name
                )
                
                broadcast_message = {
                    "event_type": "player_kicked",
                    "data": event_data,
                    "player_name": player_name
                }

            elif event_type == "dice_roll":
                # UPDATED: Enhanced dice roll logging with prompt context
                roll_data = event_data
                player = roll_data.get("player")
                dice = roll_data.get("dice")
                result = roll_data.get("result")
                roll_for = roll_data.get("roll_for", "General Roll")
                prompt_id = roll_data.get("prompt_id")  # New: Get prompt ID if this was a prompted roll
                
                # Enhanced logging with context
                if roll_for and roll_for != "General Roll":
                    log_message = f"{player} [{roll_for}]: {dice}: {result}"
                else:
                    log_message = f"{player}: {dice}: {result}"
                
                add_adventure_log(
                    room_id=client_id,
                    message=log_message,
                    log_type="player-roll",
                    player_name=player
                )
                
                if prompt_id:
                    print(f"🎲 {player} rolled {dice} for {roll_for}: {result} (completing prompt {prompt_id})")
                else:
                    print(f"🎲 {player} rolled {dice} for {roll_for}: {result}")
                
                broadcast_message = {
                    "event_type": "dice_roll",
                    "data": {
                        **event_data,
                        "roll_for": roll_for,
                        "prompt_id": prompt_id  # New: Include prompt ID in broadcast
                    }
                }
                
                # Auto-clear prompt if this was a prompted roll (has prompt_id)
                clear_prompt_message = None
                if prompt_id:
                    clear_prompt_message = {
                        "event_type": "dice_prompt_clear",
                        "data": {
                            "cleared_by": "system",
                            "auto_cleared": True,
                            "prompt_id": prompt_id  # New: Clear specific prompt by ID
                        }
                    }
                # We'll send this after the dice roll broadcast
            
            elif event_type == "clear_system_messages":
                # Existing clear system messages logic...
                cleared_by = event_data.get("cleared_by", player_name)
                
                try:
                    deleted_count = adventure_log_service.clear_system_messages(client_id)
                    
                    add_adventure_log(
                        room_id=client_id,
                        message=f"System messages cleared by {cleared_by}",
                        log_type="system",
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
                    deleted_count = adventure_log_service.clear_all_messages(client_id)
                    
                    add_adventure_log(
                        room_id=client_id,
                        message=f"All adventure log messages cleared by {cleared_by}",
                        log_type="system",
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

            else:
                # Chat messages and other events...
                timestamp = datetime.now().strftime("%H:%M")
                
                add_adventure_log(
                    room_id=client_id,
                    message=data.get("data", ""),
                    log_type="chat",
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
            
            # Handle special case: auto-clear prompt after dice roll
            if event_type == "dice_roll" and clear_prompt_message:
                # Add a small delay and then clear the prompt
                import asyncio
                await asyncio.sleep(0.1)  # Small delay to ensure dice roll is processed first
                await manager.update_data(clear_prompt_message)
            
    except WebSocketDisconnect:
        # Server-side disconnect handling with seat cleanup
        add_adventure_log(
            room_id=client_id,
            message=f"{player_name} disconnected",
            log_type="system",
            player_name=player_name
        )
        
        manager.remove_connection(websocket)
        
        # Clean up disconnected player's seat
        from gameservice import GameService
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




