# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from pydantic import BaseModel
from pymongo.asynchronous.collection import AsyncCollection
from pymongo.asynchronous.database import AsyncDatabase
from gameservice import GameService
from shared_contracts.map import MapConfig
import logging
from typing import Optional, Dict, Any


logger = logging.getLogger()

class MapSettings(BaseModel):
    """Map configuration for a room — composes the shared MapConfig contract."""

    room_id: str
    uploaded_by: str
    active: bool = True
    map_config: MapConfig  # the whole contract, stored nested in MongoDB

class MapService:
    """Managing active maps for rooms"""

    def __init__(self, db: AsyncDatabase):
        self.collection: AsyncCollection = db.active_maps
        # No I/O in the constructor: create_indexes() is awaited once at boot
        # from app.py's lifespan, where there is an event loop to await on.

    async def create_indexes(self):
        """
        Creates indexes for the active_maps collection
        optimizing queries for active maps by room_id
        """
        await self.collection.create_index([("room_id", 1), ("active", 1)])
        logger.info(f"Created indexes for {self.collection.name} collection")
        
    async def set_active_map(self, room_id: str, map_settings: MapSettings) -> bool:
        """Set the active map for a room"""
        try:
            # First, deactivate any existing active maps for this room
            await self.collection.update_many(
                {"room_id": room_id, "active": True},
                {"$set": {"active": False}}
            )

            # Insert or update the map (nested shape stored in MongoDB)
            map_data = map_settings.model_dump()
            await self.collection.replace_one(
                {"room_id": room_id, "map_config.filename": map_settings.map_config.filename},
                map_data,
                upsert=True
            )

            # Update active_display on the game session document
            await GameService.set_active_display(room_id, "map")

            logger.info(f"Set active map for room {room_id}: {map_settings.map_config.filename}")
            return True

        except Exception as e:
            logger.error(f"Failed to set active map for room {room_id}: {e}")
            return False
    
    async def get_active_map(self, room_id: str) -> Optional[Dict[str, Any]]:
        """Get the currently active map for a room"""
        try:
            map_doc = await self.collection.find_one(
                {"room_id": room_id, "active": True}
            )
            
            if map_doc:
                # Convert ObjectId to string for JSON serialization
                map_doc["_id"] = str(map_doc["_id"])
                map_conf = map_doc.get('map_config', {})
                logger.info(f"Loading active map for room {room_id}: {map_conf.get('filename')} with grid_config: {map_conf.get('grid_config')}")
            else:
                logger.info(f"No active map found for room {room_id}")
                
            return map_doc
            
        except Exception as e:
            logger.error(f"Failed to get active map for room {room_id}: {e}")
            return None
    
    async def get_room_map_by_filename(self, room_id: str, filename: str) -> Optional[Dict[str, Any]]:
        """One room's stored doc for a specific map file, active or not.

        Backs the per-map preservation on map_load: cycling from map A to B
        and back restores A's painted fog and tuned grid, which needs the
        inactive doc that get_active_map cannot return.

        Returns None when the room has never held that map, and when filename
        is empty — an empty filename would otherwise match on a missing field
        and hand back an unrelated document.
        """
        if not filename:
            return None

        try:
            return await self.collection.find_one(
                {"room_id": room_id, "map_config.filename": filename}
            )
        except Exception as e:
            logger.error(f"Failed to look up map {filename} for room {room_id}: {e}")
            return None

    async def clear_active_map(self, room_id: str) -> bool:
        """Clear the active map for a room"""
        try:
            await self.collection.update_many(
                {"room_id": room_id, "active": True},
                {"$set": {"active": False}}
            )
            
            logger.info(f"Cleared active map for room {room_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to clear active map for room {room_id}: {e}")
            return False
    
    async def update_map_config(self, room_id: str, filename: str,
                         grid_config: Optional[Dict[str, Any]] = ...,
                         map_image_config: Optional[Dict[str, Any]] = ...,
                         pc_token_scale: Optional[float] = ...) -> bool:
        """Update map configuration (grid settings, image positioning, etc.).

        Every field is written by path in one `$set`, so a caller changing one
        of them cannot disturb the others or the fog sharing the document. An
        omitted argument is not written at all; passing None writes null,
        which is why the sentinel is `...` rather than None.
        """
        try:
            update_data = {}

            # Handle grid_config parameter (including explicit None) — nested path
            if grid_config is not ...:
                update_data["map_config.grid_config"] = grid_config
                logger.info(f"Setting map_config.grid_config to: {grid_config}")

            # Handle map_image_config parameter (including explicit None) — nested path
            if map_image_config is not ...:
                update_data["map_config.map_image_config"] = map_image_config
                logger.info(f"Setting map_config.map_image_config to: {map_image_config}")

            # Handle pc_token_scale parameter (including explicit None, which
            # resets the map to the default size) — nested path
            if pc_token_scale is not ...:
                update_data["map_config.pc_token_scale"] = pc_token_scale
                logger.info(f"Setting map_config.pc_token_scale to: {pc_token_scale}")

            if not update_data:
                return True  # Nothing to update

            existing_map = await self.collection.find_one(
                {"room_id": room_id, "map_config.filename": filename, "active": True}
            )

            if not existing_map:
                logger.error(f"No active map found for room {room_id}, filename {filename}")
                return False

            map_conf = existing_map.get("map_config", {})
            logger.info(f"Found existing map before update: {map_conf.get('filename')} with grid_config: {map_conf.get('grid_config')}")

            result = await self.collection.update_one(
                {"room_id": room_id, "map_config.filename": filename, "active": True},
                {"$set": update_data}
            )

            logger.info(f"Database update result - matched: {result.matched_count}, modified: {result.modified_count}")

            return result.matched_count > 0

        except Exception as e:
            logger.error(f"Failed to update map config for room {room_id}: {e}")
            return False
    
    async def update_fog_config(self, room_id: str, filename: str,
                          fog_config: Optional[Dict[str, Any]]) -> bool:
        """Replace the fog-of-war regions list on the active map for a room.

        v2 fog_config shape: { "version": 2, "regions": [FogRegion, ...] }
        or None to clear all fog. Atomic full-replace — writes the entire
        fog_config object in a single $set on `map_config.fog_config`.
        Per-region partial updates are deferred to dedicated WS events.
        """
        try:
            existing_map = await self.collection.find_one(
                {"room_id": room_id, "map_config.filename": filename, "active": True}
            )
            if not existing_map:
                logger.error(f"No active map found for room {room_id}, filename {filename}")
                return False

            # Don't log the full mask payloads — just region count + version.
            meta = (
                f"regions={len(fog_config.get('regions', []))} "
                f"v{fog_config.get('version')}"
                if fog_config else "cleared"
            )
            logger.info(f"Updating fog_config for room {room_id} ({filename}): {meta}")

            result = await self.collection.update_one(
                {"room_id": room_id, "map_config.filename": filename, "active": True},
                {"$set": {"map_config.fog_config": fog_config}}
            )

            logger.info(f"Fog update result - matched: {result.matched_count}, modified: {result.modified_count}")
            return result.matched_count > 0

        except Exception as e:
            logger.error(f"Failed to update fog config for room {room_id}: {e}")
            return False

    async def update_complete_map(self, room_id: str, updated_map: Dict[str, Any]) -> bool:
        """Replace entire map object atomically"""
        try:
            map_conf = updated_map.get("map_config", {})
            filename = map_conf.get("filename")

            if not filename:
                logger.error(f"No filename provided in updated map")
                return False

            existing_map = await self.collection.find_one(
                {"room_id": room_id, "map_config.filename": filename, "active": True}
            )

            if not existing_map:
                logger.error(f"No active map found for room {room_id}, filename {filename}")
                return False

            logger.info(f"Found existing map before atomic update: {filename}")

            # Ensure the updated map maintains required fields
            updated_map_doc = {
                **updated_map,
                "room_id": room_id,
                "active": True
            }

            # Replace entire document atomically
            result = await self.collection.replace_one(
                {"room_id": room_id, "map_config.filename": filename, "active": True},
                updated_map_doc
            )

            logger.info(f"Atomic map update result - matched: {result.matched_count}, modified: {result.modified_count}")

            return result.matched_count > 0

        except Exception as e:
            logger.error(f"Failed to update complete map for room {room_id}: {e}")
            return False
    

