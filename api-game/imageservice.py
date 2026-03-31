# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from pydantic import BaseModel
from pymongo import MongoClient
from bson.objectid import ObjectId
from config.settings import get_settings
from gameservice import GameService
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
    display_mode: str = "float"  # "float" | "wrap" | "cine"
    aspect_ratio: Optional[str] = None  # e.g. "2.39:1", "16:9" — only for cine

    def __init__(self, **data):
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
            # Preserve display config from existing document for this image
            # (config applied in-game lives in MongoDB until session-end ETL)
            existing = self.collection.find_one(
                {"room_id": room_id, "filename": image_settings.filename}
            )
            if existing:
                if existing.get("display_mode"):
                    image_settings.display_mode = existing["display_mode"]
                if existing.get("aspect_ratio"):
                    image_settings.aspect_ratio = existing["aspect_ratio"]

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
            GameService.set_active_display(room_id, "image")

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
                GameService.set_active_display(room_id, "map")
            else:
                GameService.set_active_display(room_id, None)

            logger.info(f"🖼️ Cleared active image for room {room_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to clear active image for room {room_id}: {e}")
            return False

    def update_image_config(self, room_id: str, display_mode: str = None, aspect_ratio: str = None) -> bool:
        """Update display config on the active image for a room (config-only, no re-save)"""
        if self.collection is None:
            logger.error("No database connection available for image service")
            return False

        try:
            update_fields = {}
            if display_mode is not None:
                update_fields["display_mode"] = display_mode
            if aspect_ratio is not None:
                update_fields["aspect_ratio"] = aspect_ratio
            # Clear aspect_ratio when switching away from cine
            if display_mode and display_mode != "cine":
                update_fields["aspect_ratio"] = None

            if not update_fields:
                return False

            result = self.collection.update_one(
                {"room_id": room_id, "active": True},
                {"$set": update_fields}
            )

            if result.modified_count > 0:
                logger.info(f"🖼️ Updated image config for room {room_id}: {update_fields}")
                return True

            logger.warning(f"🖼️ No active image to update config for room {room_id}")
            return False

        except Exception as e:
            logger.error(f"Failed to update image config for room {room_id}: {e}")
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

