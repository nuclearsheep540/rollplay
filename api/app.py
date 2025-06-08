from fastapi import FastAPI, Response, WebSocket
from datetime import datetime
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
        
        # Update MongoDB record
        GameService.update_seat_count(room_id=check_room, new_max=max_players)
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


@app.websocket("/ws/{client_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    client_id: str,  # This should be your room_id
    player_name: str
):
    await manager.connect(websocket)
    
    try:
        while True:
            data = await websocket.receive_json()
            event_type = data.get("event_type")
            event_data = data.get("data")

            if event_type == "seat_change":
                seat_layout = data.get("data")
                if not isinstance(seat_layout, list):
                    error_message = {
                        "event_type": "error",
                        "data": "Seat layout must be an array."
                    }
                    await websocket.send_json(error_message)
                    continue

                # Save to database
                try:
                    GameService.update_seat_layout(client_id, seat_layout)
                except Exception as e:
                    print(f"Failed to save seat layout: {e}")

                broadcast_message = {
                    "event_type": "seat_change",
                    "data": seat_layout
                }

            elif event_type == "combat_state":
                # Log combat state changes
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
                # Log seat count changes
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
                # Log player kicks
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
                # Log dice rolls
                roll_data = event_data
                player = roll_data.get("player")
                dice = roll_data.get("dice")
                result = roll_data.get("result")
                
                add_adventure_log(
                    room_id=client_id,
                    message=f"{player}: {dice}: {result}",
                    log_type="player-roll",
                    player_name=player
                )
                
                broadcast_message = {
                    "event_type": "dice_roll",
                    "data": event_data
                }

            else:
                # Chat messages
                timestamp = datetime.now().strftime("%H:%M")
                
                # Log chat messages
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
            
            await manager.update_data(broadcast_message)
            
    except WebSocketDisconnect:
        # Log player disconnections
        add_adventure_log(
            room_id=client_id,
            message=f"{player_name} disconnected",
            log_type="system",
            player_name=player_name
        )
        
        manager.remove_connection(websocket)
        
        disconnect_message = {
            "event_type": "player_disconnected", 
            "data": {
                "disconnected_player": player_name
            }
        }
        
        await manager.update_data(disconnect_message)




