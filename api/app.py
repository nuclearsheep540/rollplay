from fastapi import FastAPI, Response, status
import pydantic
from fastapi.exceptions import ResponseValidationError
from pydantic import Field

from config.settings import Settings

app = FastAPI()

class Message(pydantic.BaseModel):
    "A standard string message response"
#    We use the pydantic BaseModel because Fast uses 
#    pydantic validation OOTB, this ensures validation on this Type.
    msg: str


@app.get("/", tags=["Application"])
def root():
    return {"message": "OK"}
