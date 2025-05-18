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





