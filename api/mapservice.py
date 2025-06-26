# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from pydantic import BaseModel
from pymongo import MongoClient
from bson.objectid import ObjectId
from config.settings import get_settings
import logging
from datetime import datetime
from typing import Optional, Dict, Any

logger = logging.getLogger()
CONFIG = get_settings()

class MapSettings(BaseModel):
    """Map configuration for a room"""
    
    room_id: str
    map_id: str
    filename: str
    original_filename: str
    file_path: str
    upload_date: datetime
    grid_config: Dict[str, Any]
    map_image_config: Optional[Dict[str, Any]] = None
    uploaded_by: str
    active: bool = True
    
    def __init__(self, **data):
        # Lowercase the uploaded_by name
        if 'uploaded_by' in data:
            data['uploaded_by'] = data['uploaded_by'].lower()
        super().__init__(**data)

class MapService:
    """Managing active maps for rooms"""
    
    def __init__(self):
        username = CONFIG.get('MONGO_USER')
        password = CONFIG.get('MONGO_PASS')
        try:
            self.client = MongoClient(
                f'mongodb://{username}:{password}@db',
                serverSelectionTimeoutMS=5000  # 5 second timeout
            )
            self.db = self.client.rollplay
            self.collection = self.db.active_maps
            
            # Create indexes for efficient queries
            self.collection.create_index("room_id")
            self.collection.create_index([("room_id", 1), ("active", 1)])
            logger.info("Connected successfully to MongoDB for map service")
        except Exception as e:
            logger.warning(f"Could not create indexes: {e}")
            self.client = None
            self.db = None
            self.collection = None
        
    def set_active_map(self, room_id: str, map_settings: MapSettings) -> bool:
        """Set the active map for a room"""
        if self.collection is None:
            logger.error("No database connection available")
            return False
            
        try:
            # First, deactivate any existing active maps for this room
            self.collection.update_many(
                {"room_id": room_id, "active": True},
                {"$set": {"active": False}}
            )
            
            # Insert or update the new active map
            map_data = map_settings.model_dump()
            result = self.collection.replace_one(
                {"room_id": room_id, "map_id": map_settings.map_id},
                map_data,
                upsert=True
            )
            
            logger.info(f"Set active map for room {room_id}: {map_settings.filename}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to set active map for room {room_id}: {e}")
            return False
    
    def get_active_map(self, room_id: str) -> Optional[Dict[str, Any]]:
        """Get the currently active map for a room"""
        if self.collection is None:
            logger.error("No database connection available")
            return None
            
        try:
            map_doc = self.collection.find_one(
                {"room_id": room_id, "active": True}
            )
            
            if map_doc:
                # Convert ObjectId to string for JSON serialization
                map_doc["_id"] = str(map_doc["_id"])
                
            return map_doc
            
        except Exception as e:
            logger.error(f"Failed to get active map for room {room_id}: {e}")
            return None
    
    def clear_active_map(self, room_id: str) -> bool:
        """Clear the active map for a room"""
        if self.collection is None:
            logger.error("No database connection available")
            return False
            
        try:
            self.collection.update_many(
                {"room_id": room_id, "active": True},
                {"$set": {"active": False}}
            )
            
            logger.info(f"Cleared active map for room {room_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to clear active map for room {room_id}: {e}")
            return False
    
    def update_map_config(self, room_id: str, map_id: str, 
                         grid_config: Optional[Dict[str, Any]] = None,
                         map_image_config: Optional[Dict[str, Any]] = None) -> bool:
        """Update map configuration (grid settings, image positioning, etc.)"""
        if self.collection is None:
            logger.error("No database connection available")
            return False
            
        try:
            update_data = {}
            
            if grid_config is not None:
                update_data["grid_config"] = grid_config
                
            if map_image_config is not None:
                update_data["map_image_config"] = map_image_config
            
            if not update_data:
                return True  # Nothing to update
                
            result = self.collection.update_one(
                {"room_id": room_id, "map_id": map_id, "active": True},
                {"$set": update_data}
            )
            
            logger.info(f"Updated map config for room {room_id}, map {map_id}")
            return result.modified_count > 0
            
        except Exception as e:
            logger.error(f"Failed to update map config for room {room_id}: {e}")
            return False
    
    def get_room_maps(self, room_id: str) -> list:
        """Get all maps uploaded to a room (for future map management UI)"""
        if self.collection is None:
            logger.error("No database connection available")
            return []
            
        try:
            maps = list(self.collection.find(
                {"room_id": room_id}
            ).sort("upload_date", -1))
            
            # Convert ObjectIds to strings
            for map_doc in maps:
                map_doc["_id"] = str(map_doc["_id"])
                
            return maps
            
        except Exception as e:
            logger.error(f"Failed to get maps for room {room_id}: {e}")
            return []