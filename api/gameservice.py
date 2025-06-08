from pydantic import BaseModel
from pymongo import MongoClient
from bson.objectid import ObjectId
from config.settings import get_settings
import logging
import json
from datetime import datetime

logger = logging.getLogger()
CONFIG = get_settings()

class GameSettings(BaseModel):
    "Basic settings for a game lobby"

    #TODO: seats: list, for updating over WS on seat changes ??
    max_players: int
    player_name: str
    created_at: datetime


class GameService:
    "Creating and joining active game lobbies"

    def _get_active_session():
        "returns the active sessions collection"
        try: 
            conn = MongoClient('mongodb://%s:%s@db' % ('mdavey', 'pass'))
            db = conn.rollplay
            collection = db.active_sessions
            logger.info("Connected successfully to mongo DB") 
        except Exception:   
            logger.error("Could not connect to MongoDB")
        return collection

    # need to be able to generate a room_id
    # creating the room needs to update mongo with this player and basic config
    @staticmethod
    def get_room(id):
        "Gets the room id"
        
        collection = GameService._get_active_session()
        try:
            oid = ObjectId(oid=id)
            cursor = collection.find({"_id": oid})
        except Exception:
            # could be a bad oid, could be an id that doesnt match
            # could also be our test ID which isnt an objectId
            try:
                cursor = collection.find({"_id": id})
            except Exception:
                return
        
        try:
            result = [x for x in cursor]
            result = result[0] # get first record
            result["_id"] = str(result["_id"]) # cast object to str for json
            return result
        except IndexError:
            return

    # need to be able to query a room_id
    @staticmethod
    def create_room(settings: GameSettings):
        "Creates a room by adding a new record in mongodb with player config, returning the hash as the route"
        collection = GameService._get_active_session()

        result = collection.insert_one(json.loads(settings.model_dump_json()))
        id = str(result.inserted_id)
        return id

    @staticmethod
    def update_seat_count(room_id, new_max):
        collection = GameService._get_active_session()

        result = collection.update_one(
            {"_id": room_id},
            {
                "$set": {
                    "max_players": new_max,
                }
            }
        )
        return str(result)

    @staticmethod
    def update_seat_layout(room_id: str, seat_layout: list):
        """Update the seat layout for a room"""
        collection = GameService._get_active_session()

        result = collection.update_one(
            {"_id": room_id},
            {
                "$set": {
                    "seat_layout": seat_layout,
                }
            }
        )
        return str(result)

    @staticmethod
    def get_seat_layout(room_id: str) -> list:
        """Get the current seat layout for a room"""
        collection = GameService._get_active_session()
        room = collection.find_one({"_id": room_id})
        if room and "seat_layout" in room:
            return room["seat_layout"]
        else:
            # Return empty seats based on max_players if no layout exists
            max_players = room.get("max_players", 8) if room else 1
            return ["empty"] * max_players
