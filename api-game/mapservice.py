# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from pydantic import BaseModel
from pymongo import MongoClient
from bson.objectid import ObjectId
from config.settings import get_settings
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger()
CONFIG = get_settings()

class MapSettings(BaseModel):
    """Map configuration for a room"""

    room_id: str
    asset_id: Optional[str] = None  # PostgreSQL MediaAsset ID for ETL restoration
    filename: str  # This is our unique identifier
    original_filename: str
    file_path: str
    grid_config: Optional[Dict[str, Any]] = None
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
                f'mongodb://{username}:{password}@mongo',
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
            
            # Insert or update the map with provided grid config
            map_data = map_settings.model_dump()
            result = self.collection.replace_one(
                {"room_id": room_id, "filename": map_settings.filename},
                map_data,
                upsert=True
            )
            
            # Update active_display on the game session document
            self._set_active_display(room_id, "map")

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
                logger.info(f"📤 Loading active map for room {room_id}: {map_doc.get('filename')} with grid_config: {map_doc.get('grid_config')}")
            else:
                logger.info(f"📭 No active map found for room {room_id}")
                
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
    
    def update_map_config(self, room_id: str, filename: str, 
                         grid_config: Optional[Dict[str, Any]] = ...,
                         map_image_config: Optional[Dict[str, Any]] = ...) -> bool:
        """Update map configuration (grid settings, image positioning, etc.)"""
        if self.collection is None:
            logger.error("No database connection available")
            return False
            
        try:
            update_data = {}
            
            # Handle grid_config parameter (including explicit None)
            if grid_config is not ...:
                update_data["grid_config"] = grid_config
                logger.info(f"Setting grid_config to: {grid_config}")
                
            # Handle map_image_config parameter (including explicit None)
            if map_image_config is not ...:
                update_data["map_image_config"] = map_image_config
                logger.info(f"Setting map_image_config to: {map_image_config}")
            
            if not update_data:
                return True  # Nothing to update
                
            # Debug: Check if the map exists before updating
            existing_map = self.collection.find_one(
                {"room_id": room_id, "filename": filename, "active": True}
            )
            
            if not existing_map:
                logger.error(f"❌ No active map found for room {room_id}, filename {filename}")
                return False
            
            logger.info(f"🔍 Found existing map before update: {existing_map.get('filename')} with grid_config: {existing_map.get('grid_config')}")
            
            result = self.collection.update_one(
                {"room_id": room_id, "filename": filename, "active": True},
                {"$set": update_data}
            )
            
            logger.info(f"✅ Database update result - matched: {result.matched_count}, modified: {result.modified_count}")
            
            # Verify the update by fetching the updated document
            updated_map = self.collection.find_one(
                {"room_id": room_id, "filename": filename, "active": True}
            )
            if updated_map:
                logger.info(f"🔍 Verified updated map has grid_config: {updated_map.get('grid_config')}")
            else:
                logger.error(f"❌ Could not find map after update")
            
            return result.matched_count > 0  # Changed: return True if we found and attempted to update the map
            
        except Exception as e:
            logger.error(f"Failed to update map config for room {room_id}: {e}")
            return False
    
    def update_complete_map(self, room_id: str, updated_map: Dict[str, Any]) -> bool:
        """Replace entire map object atomically"""
        if self.collection is None:
            logger.error("No database connection available")
            return False
            
        try:
            filename = updated_map.get("filename")
            
            if not filename:
                logger.error(f"❌ No filename provided in updated map")
                return False
            
            # Debug: Check if the map exists before updating
            existing_map = self.collection.find_one(
                {"room_id": room_id, "filename": filename, "active": True}
            )
            
            if not existing_map:
                logger.error(f"❌ No active map found for room {room_id}, filename {filename}")
                return False
            
            logger.info(f"🔍 Found existing map before atomic update: {existing_map.get('filename')}")
            
            # Ensure the updated map maintains required fields
            updated_map_doc = {
                **updated_map,
                "room_id": room_id,
                "active": True
            }
            
            # Replace entire document atomically
            result = self.collection.replace_one(
                {"room_id": room_id, "filename": filename, "active": True},
                updated_map_doc
            )
            
            logger.info(f"✅ Atomic map update result - matched: {result.matched_count}, modified: {result.modified_count}")
            
            # Verify the update by fetching the updated document
            verified_map = self.collection.find_one(
                {"room_id": room_id, "filename": filename, "active": True}
            )
            if verified_map:
                logger.info(f"🔍 Verified updated map has grid_config: {verified_map.get('grid_config')}")
            else:
                logger.error(f"❌ Could not find map after atomic update")
            
            return result.matched_count > 0
            
        except Exception as e:
            logger.error(f"Failed to update complete map for room {room_id}: {e}")
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

    def _set_active_display(self, room_id: str, display_type: str):
        """Update the active_display field on the game session document"""
        try:
            from gameservice import GameService
            collection = GameService._get_active_session()

            try:
                oid = ObjectId(oid=room_id)
                filter_criteria = {"_id": oid}
            except Exception:
                filter_criteria = {"_id": room_id}

            collection.update_one(
                filter_criteria,
                {"$set": {"active_display": display_type}}
            )
            logger.info(f"🗺️ Set active_display to '{display_type}' for room {room_id}")
        except Exception as e:
            logger.error(f"Failed to set active_display for room {room_id}: {e}")