from fastapi import FastAPI, Response, status
import pydantic
from fastapi.exceptions import ResponseValidationError
from pydantic import Field
from gameservice import GameService, GameSettings

from config.settings import Settings

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
origins = [
    "http://localhost:3000"
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
