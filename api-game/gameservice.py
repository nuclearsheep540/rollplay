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

DEFAULT_SEAT_COLORS = [
    "#3b82f6",  # blue
    "#ef4444",  # red
    "#22c55e",  # green
    "#f97316",  # orange
    "#a855f7",  # purple
    "#06b6d4",  # cyan
    "#ec4899",  # pink
    "#65a30d",  # lime
]

class GameSettings(BaseModel):
    "Basic settings for a game lobby"

    max_players: int
    seat_layout: list
    created_at: datetime
    seat_colors: dict
    moderators: list = []
    dungeon_master: str = ""
    room_host: str = dungeon_master
    available_assets: list = []  # Asset refs from campaign library (maps, audio, images)
    campaign_id: str = ""  # PostgreSQL campaign ID for proxying asset requests to api-site
    player_metadata: dict = {}  # Player -> character metadata hydrated during cold -> hot ETL
    audio_state: dict = {}  # Per-channel audio state for late-joiner sync
    audio_track_config: dict = {}  # Per-track config stash (survives channel swaps within a session)
    
    def __init__(self, **data):
        # Lowercase the room_host and any names in seat_layout
        if 'room_host' in data:
            data['room_host'] = data['room_host'].lower()
        if 'seat_layout' in data:
            data['seat_layout'] = [name.lower() if name != "empty" else name for name in data['seat_layout']]
        if 'player_metadata' in data and isinstance(data['player_metadata'], dict):
            data['player_metadata'] = {
                str(player_name).lower(): metadata
                for player_name, metadata in data['player_metadata'].items()
            }
        if 'moderators' in data:
            data['moderators'] = [name.lower() for name in data['moderators']]
        if 'dungeon_master' in data:
            data['dungeon_master'] = data['dungeon_master'].lower()
        super().__init__(**data)

class GameService:
    "Creating and joining active game lobbies"

    @staticmethod
    def room_filter(room_id: str) -> dict:
        """Build MongoDB filter for _id, handling both ObjectId and string formats."""
        try:
            return {"_id": ObjectId(oid=room_id)}
        except Exception:
            return {"_id": room_id}

    @staticmethod
    def _get_active_session():
        "returns the active sessions collection"
        username = CONFIG.get('MONGO_USER')
        password = CONFIG.get('MONGO_PASS')
        try:
            conn = MongoClient(f'mongodb://{username}:{password}@mongo')
            db = conn.rollplay
            logger.info("Connected successfully to mongo DB")
            return db.active_sessions
        except Exception:
            logger.error("Could not connect to MongoDB")
            raise

    # need to be able to generate a room_id
    # creating the room needs to update mongo with this player and basic config
    @staticmethod
    def get_room(id):
        "Gets the room id"
        
        collection = GameService._get_active_session()
        filter_criteria = GameService.room_filter(id)
        cursor = collection.find(filter_criteria)

        try:
            result = [x for x in cursor]
            result = result[0] # get first record
            result["_id"] = str(result["_id"]) # cast object to str for json
            return result
        except IndexError:
            return

    @staticmethod
    def delete_room(id):
        """Delete a room from active_sessions collection"""
        collection = GameService._get_active_session()
        filter_criteria = GameService.room_filter(id)
        try:
            result = collection.delete_one(filter_criteria)
            logger.info(f"Deleted room {id}: {result.deleted_count} documents")
            return result.deleted_count > 0
        except Exception as e:
            logger.error(f"Failed to delete room {id}: {e}")
            return False

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

        filter_criteria = GameService.room_filter(room_id)

        # Validate: Check for duplicate players in seats
        player_names = [name for name in normalized_seat_layout if name != "empty"]
        if len(player_names) != len(set(player_names)):
            duplicates = [name for name in set(player_names) if player_names.count(name) > 1]
            raise Exception(f"Player '{duplicates[0]}' already occupies another seat")

        # Validate: Prevent DM from taking player seats
        room = collection.find_one(filter_criteria)
        if room:
            dm_name = room.get("dungeon_master", "").lower()
            if dm_name and dm_name in normalized_seat_layout:
                raise Exception("Dungeon Master cannot sit in party seats")

            moderators = {
                str(name).lower()
                for name in room.get("moderators", [])
                if isinstance(name, str) and name
            }
            seated_staff = [name for name in player_names if name in moderators]
            if seated_staff:
                raise ValueError("Moderators cannot sit in party seats")

            player_metadata = room.get("player_metadata", {})
            if not isinstance(player_metadata, dict):
                player_metadata = {}

            # Any seated player must be an adventurer with a selected character in hot-state metadata.
            invalid_players = [
                name for name in player_names
                if not player_metadata.get(name, {}).get("character_id")
            ]
            if invalid_players:
                raise ValueError("Only adventurers with selected characters can sit in party seats")
        
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
        
        filter_criteria = GameService.room_filter(room_id)

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
        
        room = collection.find_one(GameService.room_filter(room_id))

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
        
        filter_criteria = GameService.room_filter(room_id)

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
        
        room = collection.find_one(GameService.room_filter(room_id))

        if room and "seat_colors" in room:
            return room["seat_colors"]
        else:
            max_players = room.get("max_players", 8) if room else 8
            return {str(i): DEFAULT_SEAT_COLORS[i] if i < len(DEFAULT_SEAT_COLORS) else DEFAULT_SEAT_COLORS[0] for i in range(max_players)}

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
    def player_has_selected_character(room_id: str, player_name: str) -> bool:
        """Check whether a player is an adventurer in this hot-state session."""
        room = GameService.get_room(room_id)
        if not room:
            return False

        player_metadata = room.get("player_metadata", {})
        if not isinstance(player_metadata, dict):
            return False

        metadata = player_metadata.get(player_name.lower(), {})
        return bool(metadata.get("character_id"))

    @staticmethod
    def add_moderator(room_id: str, player_name: str):
        """Add a player as moderator"""
        collection = GameService._get_active_session()
        
        # Lowercase the player name for consistency
        player_name = player_name.lower()

        current_seat_layout = GameService.get_seat_layout(room_id)
        if player_name in [seat.lower() for seat in current_seat_layout if isinstance(seat, str) and seat != "empty"]:
            raise ValueError("Seated players cannot be moderators")

        if GameService.player_has_selected_character(room_id, player_name):
            raise ValueError("Adventurers cannot be moderators")
        
        filter_criteria = GameService.room_filter(room_id)

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
        
        filter_criteria = GameService.room_filter(room_id)

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
        
        filter_criteria = GameService.room_filter(room_id)

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

        filter_criteria = GameService.room_filter(room_id)

        result = collection.update_one(
            filter_criteria,
            {"$set": {"dungeon_master": ""}}
        )

        if result.matched_count == 0:
            raise Exception(f"Room {room_id} not found")

        return result.modified_count > 0

    @staticmethod
    def update_player_character(room_id: str, character_data: dict):
        """
        Update a player's character data in room-level metadata.

        character_data should contain:
        - player_name: str (to identify which seat to update)
        - user_id: str
        - character_id: str
        - character_name: str
        - character_class: list[str] | str
        - character_race: str
        - level: int
        - hp_current: int
        - hp_max: int
        - ac: int
        """
        collection = GameService._get_active_session()

        filter_criteria = GameService.room_filter(room_id)

        # Get current room
        room = collection.find_one(filter_criteria)
        if not room:
            raise Exception(f"Room {room_id} not found")

        player_name = character_data.get("player_name", "").lower()
        if not player_name:
            raise Exception("player_name is required")

        player_metadata = room.get("player_metadata", {})
        if not isinstance(player_metadata, dict):
            player_metadata = {}
        player_metadata[player_name] = {
            "player_name": player_name,
            "user_id": character_data.get("user_id"),
            "character_id": character_data.get("character_id"),
            "character_name": character_data.get("character_name"),
            "character_class": character_data.get("character_class"),
            "character_race": character_data.get("character_race"),
            "level": character_data.get("level"),
            "hp_current": character_data.get("hp_current"),
            "hp_max": character_data.get("hp_max"),
            "ac": character_data.get("ac"),
        }

        result = collection.update_one(
            filter_criteria,
            {"$set": {"player_metadata": player_metadata}}
        )

        if result.matched_count == 0:
            raise Exception(f"Room {room_id} not found")

        logger.info(f"Updated character for player {player_name} in room {room_id}")
        return True

    @staticmethod
    def update_audio_state(room_id: str, channel_id: str, channel_state: dict):
        """Update a single audio channel's state in the active session (fire-and-forget)"""
        collection = GameService._get_active_session()

        filter_criteria = GameService.room_filter(room_id)

        collection.update_one(
            filter_criteria,
            {"$set": {f"audio_state.{channel_id}": channel_state}}
        )

    @staticmethod
    def get_audio_state(room_id: str) -> dict:
        """Get current audio state from active session"""
        collection = GameService._get_active_session()

        room = collection.find_one(GameService.room_filter(room_id), {"audio_state": 1})

        return room.get("audio_state", {}) if room else {}

    @staticmethod
    def save_track_config(room_id: str, asset_id: str, config: dict):
        """Stash a track's config when swapped out of a channel (survives channel swaps)"""
        collection = GameService._get_active_session()

        filter_criteria = GameService.room_filter(room_id)

        collection.update_one(
            filter_criteria,
            {"$set": {f"audio_track_config.{asset_id}": config}}
        )

    @staticmethod
    def get_track_config(room_id: str, asset_id: str):
        """Retrieve a stashed track config (returns None if never loaded)"""
        collection = GameService._get_active_session()

        filter_criteria = GameService.room_filter(room_id)

        session = collection.find_one(filter_criteria, {f"audio_track_config.{asset_id}": 1})
        if session:
            return session.get("audio_track_config", {}).get(asset_id)
        return None

    @staticmethod
    def remove_track_config(room_id: str, asset_id: str):
        """Remove stashed config when track is loaded back into a channel"""
        collection = GameService._get_active_session()

        filter_criteria = GameService.room_filter(room_id)

        collection.update_one(
            filter_criteria,
            {"$unset": {f"audio_track_config.{asset_id}": ""}}
        )

    @staticmethod
    def set_active_display(room_id: str, display_type):
        """Update the active_display field on the game session document"""
        collection = GameService._get_active_session()

        filter_criteria = GameService.room_filter(room_id)

        collection.update_one(
            filter_criteria,
            {"$set": {"active_display": display_type}}
        )
        logger.info(f"Set active_display to '{display_type}' for room {room_id}")
