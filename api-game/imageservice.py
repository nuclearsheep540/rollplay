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


class ImageSettings(BaseModel):
    """Image configuration for a room"""

    room_id: str
    asset_id: Optional[str] = None  # PostgreSQL MediaAsset ID for ETL restoration
    filename: str
    original_filename: str
    file_path: str
    loaded_by: str
    active: bool = True

    def __init__(self, **data):
        # Lowercase the loaded_by name
        if 'loaded_by' in data:
            data['loaded_by'] = data['loaded_by'].lower()
        super().__init__(**data)


class ImageService:
    """Managing active images for rooms"""

    def __init__(self):
        username = CONFIG.get('MONGO_USER')
        password = CONFIG.get('MONGO_PASS')
        try:
            self.client = MongoClient(
                f'mongodb://{username}:{password}@mongo',
                serverSelectionTimeoutMS=5000
            )
            self.db = self.client.rollplay
            self.collection = self.db.active_images

            # Create indexes for efficient queries
            self.collection.create_index("room_id")
            self.collection.create_index([("room_id", 1), ("active", 1)])
            logger.info("Connected successfully to MongoDB for image service")
        except Exception as e:
            logger.warning(f"Could not create indexes for image service: {e}")
            self.client = None
            self.db = None
            self.collection = None

    def set_active_image(self, room_id: str, image_settings: ImageSettings) -> bool:
        """Set the active image for a room and update active_display to 'image'"""
        if self.collection is None:
            logger.error("No database connection available for image service")
            return False

        try:
            # Deactivate any existing active images for this room
            self.collection.update_many(
                {"room_id": room_id, "active": True},
                {"$set": {"active": False}}
            )

            # Insert or update the image
            image_data = image_settings.model_dump()
            self.collection.replace_one(
                {"room_id": room_id, "filename": image_settings.filename},
                image_data,
                upsert=True
            )

            # Update active_display on the game session document
            self._set_active_display(room_id, "image")

            logger.info(f"🖼️ Set active image for room {room_id}: {image_settings.filename}")
            return True

        except Exception as e:
            logger.error(f"Failed to set active image for room {room_id}: {e}")
            return False

    def get_active_image(self, room_id: str) -> Optional[Dict[str, Any]]:
        """Get the currently active image for a room"""
        if self.collection is None:
            logger.error("No database connection available for image service")
            return None

        try:
            image_doc = self.collection.find_one(
                {"room_id": room_id, "active": True}
            )

            if image_doc:
                image_doc["_id"] = str(image_doc["_id"])
                logger.info(f"📤 Loading active image for room {room_id}: {image_doc.get('filename')}")
            else:
                logger.info(f"📭 No active image found for room {room_id}")

            return image_doc

        except Exception as e:
            logger.error(f"Failed to get active image for room {room_id}: {e}")
            return None

    def clear_active_image(self, room_id: str) -> bool:
        """Clear the active image for a room and update active_display"""
        if self.collection is None:
            logger.error("No database connection available for image service")
            return False

        try:
            self.collection.update_many(
                {"room_id": room_id, "active": True},
                {"$set": {"active": False}}
            )

            # Fall back to map if one exists, otherwise null
            active_map = self.db.active_maps.find_one(
                {"room_id": room_id, "active": True}
            ) if self.db else None
            if active_map:
                self._set_active_display(room_id, "map")
            else:
                self._set_active_display(room_id, None)

            logger.info(f"🖼️ Cleared active image for room {room_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to clear active image for room {room_id}: {e}")
            return False

    def get_active_display(self, room_id: str) -> Optional[str]:
        """Get the current active_display value from the game session"""
        try:
            from gameservice import GameService
            room = GameService.get_room(room_id)
            if room:
                return room.get("active_display")
            return None
        except Exception as e:
            logger.error(f"Failed to get active_display for room {room_id}: {e}")
            return None

    def _set_active_display(self, room_id: str, display_type: Optional[str]):
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
            logger.info(f"🖼️ Set active_display to '{display_type}' for room {room_id}")
        except Exception as e:
            logger.error(f"Failed to set active_display for room {room_id}: {e}")
