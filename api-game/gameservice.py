# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later
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

    max_players: int
    seat_layout: list
    created_at: datetime
    seat_colors: dict
    moderators: list = []
    dungeon_master: str = ""
    room_host: str = dungeon_master
    
    def __init__(self, **data):
        # Lowercase the room_host and any names in seat_layout
        if 'room_host' in data:
            data['room_host'] = data['room_host'].lower()
        if 'seat_layout' in data:
            data['seat_layout'] = [name.lower() if name != "empty" else name for name in data['seat_layout']]
        if 'moderators' in data:
            data['moderators'] = [name.lower() for name in data['moderators']]
        if 'dungeon_master' in data:
            data['dungeon_master'] = data['dungeon_master'].lower()
        super().__init__(**data)

class GameService:
    "Creating and joining active game lobbies"


    def _get_active_session():
        "returns the active sessions collection"
        username = CONFIG.get('MONGO_USER')
        password = CONFIG.get('MONGO_PASS')
        try: 
            conn = MongoClient(f'mongodb://{username}:{password}@mongo')
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
    def create_room(settings: GameSettings, room_id: str = None):
        "Creates a room by adding a new record in mongodb with player config, returning the hash as the route"
        collection = GameService._get_active_session()

        room_data = json.loads(settings.model_dump_json())
        
        # If room_id is provided, use it as the MongoDB _id
        if room_id:
            room_data["_id"] = room_id
            result = collection.insert_one(room_data)
            return room_id
        else:
            # Original behavior - auto-generate ObjectId
            result = collection.insert_one(room_data)
            id = str(result.inserted_id)
            return id

    @staticmethod
    def update_seat_layout(room_id: str, seat_layout: list):
        """Update the seat layout for a room"""
        collection = GameService._get_active_session()
        
        # Lowercase all player names in the seat layout for consistency
        normalized_seat_layout = [name.lower() if name != "empty" else name for name in seat_layout]
        
        # Handle ObjectId conversion like get_room does
        try:
            oid = ObjectId(oid=room_id)
            filter_criteria = {"_id": oid}
        except Exception:
            # Fall back to string ID (for test rooms or non-ObjectId rooms)
            filter_criteria = {"_id": room_id}
        
        print(f"🔄 Updating seat layout with filter: {filter_criteria}")
        print(f"📝 New seat layout: {normalized_seat_layout}")
        
        result = collection.update_one(
            filter_criteria,
            {
                "$set": {
                    "seat_layout": normalized_seat_layout,
                }
            }
        )
        
        print(f"📊 Update result: matched={result.matched_count}, modified={result.modified_count}")
        
        if result.matched_count == 0:
            print(f"❌ No document found with _id: {room_id}")
            raise Exception(f"Room {room_id} not found")
        
        if result.modified_count == 0:
            print(f"⚠️ Document found but not modified (seat layout might be the same)")
        
        return str(result)

    @staticmethod
    def update_seat_count(room_id, new_max):
        """Update the maximum number of seats for a room"""
        collection = GameService._get_active_session()
        
        # Handle ObjectId conversion like get_room does
        try:
            oid = ObjectId(oid=room_id)
            filter_criteria = {"_id": oid}
        except Exception:
            # Fall back to string ID (for test rooms or non-ObjectId rooms)
            filter_criteria = {"_id": room_id}
        
        print(f"🔄 Updating seat count with filter: {filter_criteria}")
        print(f"📝 New max players: {new_max}")
        
        result = collection.update_one(
            filter_criteria,
            {
                "$set": {
                    "max_players": new_max,
                }
            }
        )
        
        print(f"📊 Update result: matched={result.matched_count}, modified={result.modified_count}")
        
        if result.matched_count == 0:
            print(f"❌ No document found with _id: {room_id}")
            raise Exception(f"Room {room_id} not found")
        
        return str(result)

    @staticmethod
    def get_seat_layout(room_id: str) -> list:
        """Get the current seat layout for a room"""
        collection = GameService._get_active_session()
        
        # Handle ObjectId conversion like get_room does
        try:
            oid = ObjectId(oid=room_id)
            room = collection.find_one({"_id": oid})
        except Exception:
            room = collection.find_one({"_id": room_id})
        
        if room and "seat_layout" in room:
            return room["seat_layout"]
        else:
            # Return empty seats based on max_players if no layout exists
            max_players = room.get("max_players", 8) if room else 1
            return ["empty"] * max_players

    @staticmethod
    def update_seat_colors(room_id: str, seat_colors: dict):
        """Update seat colors for a room"""
        collection = GameService._get_active_session()
        
        # Handle ObjectId conversion like get_room does
        try:
            oid = ObjectId(oid=room_id)
            filter_criteria = {"_id": oid}
        except Exception:
            # Fall back to string ID (for test rooms or non-ObjectId rooms)
            filter_criteria = {"_id": room_id}
        
        print(f"🎨 Updating seat colors with filter: {filter_criteria}")
        print(f"🌈 New seat colors: {seat_colors}")
        
        result = collection.update_one(
            filter_criteria,
            {
                "$set": {
                    "seat_colors": seat_colors,
                }
            }
        )
        
        print(f"📊 Update result: matched={result.matched_count}, modified={result.modified_count}")
        
        if result.matched_count == 0:
            print(f"❌ No document found with _id: {room_id}")
            raise Exception(f"Room {room_id} not found")
        
        return str(result)

    @staticmethod
    def get_seat_colors(room_id: str) -> dict:
        """Get the current seat colors for a room"""
        collection = GameService._get_active_session()
        
        # Handle ObjectId conversion like get_room does
        try:
            oid = ObjectId(oid=room_id)
            room = collection.find_one({"_id": oid})
        except Exception:
            room = collection.find_one({"_id": room_id})
        
        if room and "seat_colors" in room:
            return room["seat_colors"]
        else:
            # Return default colors based on seat indices (0-7)
            default_colors = {
                "0": "#3b82f6",  # blue
                "1": "#ef4444",  # red
                "2": "#22c55e",  # green
                "3": "#f97316",  # orange
                "4": "#a855f7",  # purple
                "5": "#06b6d4",  # cyan
                "6": "#ec4899",  # pink
                "7": "#65a30d",  # lime
            }
            max_players = room.get("max_players", 8) if room else 8
            return {str(i): default_colors.get(str(i), "#3b82f6") for i in range(max_players)}

    @staticmethod
    def is_host(room_id: str, player_name: str) -> bool:
        """Check if player is the room host"""
        room = GameService.get_room(room_id)
        if not room:
            return False
        room_host = room.get("room_host", "")
        return room_host.lower() == player_name.lower()

    @staticmethod 
    def is_moderator(room_id: str, player_name: str) -> bool:
        """Check if player is a moderator (includes host)"""
        room = GameService.get_room(room_id)
        if not room:
            return False
        
        # Host is always a moderator (case-insensitive)
        room_host = room.get("room_host", "")
        if room_host.lower() == player_name.lower():
            return True
            
        # Check moderators list (case-insensitive)
        moderators = room.get("moderators", [])
        return any(mod.lower() == player_name.lower() for mod in moderators)

    @staticmethod
    def is_dm(room_id: str, player_name: str) -> bool:
        """Check if player is the dungeon master"""
        room = GameService.get_room(room_id)
        if not room:
            return False
        dungeon_master = room.get("dungeon_master", "")
        return dungeon_master.lower() == player_name.lower()

    @staticmethod
    def add_moderator(room_id: str, player_name: str):
        """Add a player as moderator"""
        collection = GameService._get_active_session()
        
        # Lowercase the player name for consistency
        player_name = player_name.lower()
        
        # Handle ObjectId conversion
        try:
            oid = ObjectId(oid=room_id)
            filter_criteria = {"_id": oid}
        except Exception:
            filter_criteria = {"_id": room_id}
        
        result = collection.update_one(
            filter_criteria,
            {"$addToSet": {"moderators": player_name}}
        )
        
        if result.matched_count == 0:
            raise Exception(f"Room {room_id} not found")
        
        return result.modified_count > 0

    @staticmethod
    def remove_moderator(room_id: str, player_name: str):
        """Remove a player from moderators"""
        collection = GameService._get_active_session()
        
        # Lowercase the player name for consistency
        player_name = player_name.lower()
        
        # Handle ObjectId conversion
        try:
            oid = ObjectId(oid=room_id)
            filter_criteria = {"_id": oid}
        except Exception:
            filter_criteria = {"_id": room_id}
        
        result = collection.update_one(
            filter_criteria,
            {"$pull": {"moderators": player_name}}
        )
        
        if result.matched_count == 0:
            raise Exception(f"Room {room_id} not found")
        
        return result.modified_count > 0

    @staticmethod
    def set_dm(room_id: str, player_name: str):
        """Set a player as dungeon master"""
        collection = GameService._get_active_session()
        
        # Lowercase the player name for consistency
        player_name = player_name.lower()
        
        # Handle ObjectId conversion
        try:
            oid = ObjectId(oid=room_id)
            filter_criteria = {"_id": oid}
        except Exception:
            filter_criteria = {"_id": room_id}
        
        result = collection.update_one(
            filter_criteria,
            {"$set": {"dungeon_master": player_name}}
        )
        
        if result.matched_count == 0:
            raise Exception(f"Room {room_id} not found")
        
        return result.modified_count > 0

    @staticmethod
    def unset_dm(room_id: str):
        """Remove the current dungeon master"""
        collection = GameService._get_active_session()
        
        # Handle ObjectId conversion
        try:
            oid = ObjectId(oid=room_id)
            filter_criteria = {"_id": oid}
        except Exception:
            filter_criteria = {"_id": room_id}
        
        result = collection.update_one(
            filter_criteria,
            {"$set": {"dungeon_master": ""}}
        )
        
        if result.matched_count == 0:
            raise Exception(f"Room {room_id} not found")
        
        return result.modified_count > 0
