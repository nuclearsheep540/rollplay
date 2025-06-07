from fastapi import FastAPI, Response, WebSocket
from datetime import datetime
import pydantic
import logging
from fastapi import HTTPException

from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from starlette.websockets import WebSocketDisconnect

from gameservice import GameService, GameSettings


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


class Message(pydantic.BaseModel):
    "A standard string message response"
#    We use the pydantic BaseModel because Fast uses 
#    pydantic validation OOTB, this ensures validation on this Type.
    msg: str


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
        return check_room
    else:
        return Response(status_code=404, content='{f"id {room_id} not found")}')

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
    client_id: str,
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

                broadcast_message = {
                    "event_type": "seat_change",
                    "data": seat_layout
                }

            elif event_type == "combat_state":
                broadcast_message = {
                    "event_type": "combat_state",
                    "data": event_data
                }

            elif event_type == "seat_count_change":
                broadcast_message = {
                    "event_type": "seat_count_change",
                    "data": event_data,
                    "player_name": player_name
                }

            elif event_type == "player_kicked":
                broadcast_message = {
                    "event_type": "player_kicked",
                    "data": event_data,
                    "player_name": player_name
                }

            else:
                # use for chat messages
                timestamp = datetime.now().strftime("%H:%M")
                await manager.update_data({**data, "player_name": player_name, "utc_timestamp": timestamp})
                continue
            
            await manager.update_data(broadcast_message)
            
    except WebSocketDisconnect:
        # IMPORTANT: Remove the disconnected websocket FIRST
        manager.remove_connection(websocket)
        
        # Create disconnect message
        disconnect_message = {
            "event_type": "player_disconnected", 
            "data": {
                "disconnected_player": player_name
            }
        }
        
        # Now broadcast to remaining players (disconnected one is gone from list)
        await manager.update_data(disconnect_message)




