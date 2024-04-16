from pydantic import BaseModel
from pymongo import MongoClient
from bson.objectid import ObjectId
from config.settings import get_settings
import logging
import json

logger = logging.getLogger()
CONFIG = get_settings()

class GameSettings(BaseModel):
    "Basic settings for a game lobby"

    #TODO: seats: list, for updating over WS on seat changes ??
    max_players: int
    player_name: str


class GameService:
    "Creating and joining active game lobbies"

    # need to be able to generate a room_id
    # creating the room needs to update mongo with this player and basic config
    @staticmethod
    def get_room(id):
        "Gets the room id"
        try: 
            conn = MongoClient('mongodb://%s:%s@db' % (CONFIG["MONGO_USER"], CONFIG["MONGO_PASS"]))
            db = conn.rollplay
            collection = db.active_sessions
            logger.info("Connected successfully to mongo DB") 
        except Exception:   
            logger.error("Could not connect to MongoDB")

        try:
            oid = ObjectId(oid=id)
            cursor = collection.find({"_id": oid})
        except Exception:
            # could be a bad oid, could be an id that doesnt match
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

        try: 
            conn = MongoClient('mongodb://%s:%s@db' % ('mdavey', 'pass'))
            db = conn.rollplay
            collection = db.active_sessions
            logger.info("Connected successfully to mongo DB") 
        except Exception:   
            logger.error("Could not connect to MongoDB") 

    
        result = collection.insert_one(json.loads(settings.model_dump_json()))
        id = str(result.inserted_id)
        return id



    