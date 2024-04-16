from fastapi import FastAPI, Response, WebSocket
import pydantic
from fastapi.exceptions import ResponseValidationError
from pydantic import Field
from gameservice import GameService, GameSettings
import logging
import json
from datetime import datetime

logger = logging.getLogger()

from config.settings import Settings

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
origins = [
    "http://localhost:3000",
    "ws://localhost:3000"
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Message(pydantic.BaseModel):
    "A standard string message response"
#    We use the pydantic BaseModel because Fast uses 
#    pydantic validation OOTB, this ensures validation on this Type.
    msg: str


@app.get("/", tags=["Application"])
def root():
    return {"message": "OK"}

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
            except RuntimeError as err:
                import pdb; pdb.set_trace()

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

        if data.get("event_type") == "seat_change":
            # TODO: write the seat change to DB

            # use for seat changes
            await manager.update_data(data)
        else:
            # use for chat messages
            timestamp = datetime.now().strftime("%H:%M")
            await manager.update_data({**data, "player_name": player_name, "utc_timestamp": timestamp})





