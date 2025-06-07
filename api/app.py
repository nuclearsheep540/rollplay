from fastapi import FastAPI, Response, WebSocket
from datetime import datetime
import pydantic
import logging

from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware

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

    async def update_data(self, data):
        for connection in self.connections:
            try:
                await connection.send_json(data=data)
            except:
                pass

manager = ConnectionManager()


@app.websocket("/ws/{client_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    client_id: str,
    player_name: str
):
    await manager.connect(websocket)
    while True:
        data = await websocket.receive_json()
        event_type = data.get("event_type")

        if event_type == "seat_change":
            # Expect that the client sends a complete seat layout.
            # For example: { "event_type": "seat_change", "data": ["Alice", "", "Bob", ""] }
            seat_layout = data.get("data")
            # Optionally validate that seat_layout is a list
            if not isinstance(seat_layout, list):
                error_message = {
                    "event_type": "error",
                    "data": "Seat layout must be an array."
                }
                await websocket.send_json(error_message)
                continue

            # Broadcast the seat layout to all connected clients.
            broadcast_message = {
                "event_type": "seat_change",
                "data": seat_layout
            }
            await manager.update_data(broadcast_message)
        elif event_type == "combat_state":
            event_data = data.get("data")

            broadcast_message = {
                "event_type": "combat_state",
                "data": event_data
            }
            await manager.update_data(broadcast_message)
        else:
            # use for chat messages
            timestamp = datetime.now().strftime("%H:%M")
            await manager.update_data({**data, "player_name": player_name, "utc_timestamp": timestamp})





