# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later
import time
from datetime import datetime
from typing import List, Dict, Optional
from pymongo import MongoClient
from pymongo.collection import Collection
from config.settings import get_settings
import logging

logger = logging.getLogger()
CONFIG = get_settings()

class AdventureLogService:
    """
    Service for managing adventure logs with per-room limits using MongoDB aggregation pipelines
    """
    
    def __init__(self):
        self.adventure_logs: Collection = self._get_adventure_logs()
        
        # Create indexes for optimal performance
        self._ensure_indexes()


    def _get_adventure_logs(self):
        "returns the adventure logs collection"
        try: 
            conn = MongoClient('mongodb://%s:%s@db' % ('mdavey', 'pass'))
            db = conn.rollplay
            collection = db.adventure_logs
            logger.info("Connected successfully to mongo DB") 
        except Exception:   
            logger.error("Could not connect to MongoDB")
        return collection
    
    def _ensure_indexes(self):
        """Create necessary indexes for efficient querying"""
        try:
            # Compound index for room-based queries (most important)
            self.adventure_logs.create_index([("room_id", 1), ("log_id", -1)])
            
            # Index for stamp-based queries
            self.adventure_logs.create_index([("room_id", 1), ("timestamp", -1)])
            
            # Index for cleanup operations
            self.adventure_logs.create_index("log_id")
            
            print("Adventure logs indexes created successfully")
        except Exception as e:
            print(f"Warning: Could not create indexes: {e}")

    # ADD this method to your adventure_log_service.py class:

    def clear_system_messages(self, room_id: str) -> int:
        """
        Clear all system messages for a room
        Returns the number of deleted messages
        """
        try:           
            # Delete all system-type messages for this room
            result = self.adventure_logs.delete_many({
                "room_id": room_id,
                "type": "system"
            })
            
            print(f"🗑️ Deleted {result.deleted_count} system messages for room {room_id}")
            return result.deleted_count
            
        except Exception as e:
            print(f"❌ Error clearing system messages: {e}")
            raise e
    
    def clear_all_messages(self, room_id: str) -> int:
        """
        Clear all adventure log messages for a room
        Returns the number of deleted messages
        """
        try:           
            # Delete all messages for this room
            result = self.adventure_logs.delete_many({
                "room_id": room_id
            })
            
            print(f"🗑️ Deleted {result.deleted_count} total messages for room {room_id}")
            return result.deleted_count
            
        except Exception as e:
            print(f"❌ Error clearing all messages: {e}")
            raise e
    
    def remove_log_by_prompt_id(self, room_id: str, prompt_id: str) -> int:
        """
        Remove a specific log entry by prompt_id
        
        Args:
            room_id: The room/session ID
            prompt_id: The prompt ID to remove
            
        Returns:
            int: Number of deleted documents
        """
        try:
            result = self.adventure_logs.delete_one({
                "room_id": room_id,
                "prompt_id": prompt_id
            })
            
            print(f"🗑️ Removed log entry with prompt_id {prompt_id} from room {room_id}")
            return result.deleted_count
            
        except Exception as e:
            print(f"❌ Error removing log by prompt_id: {e}")
            raise e
    
    def add_log_entry(
        self, 
        room_id: str, 
        message: str, 
        log_type: str, 
        player_name: Optional[str] = None, 
        max_logs: int = 100,
        prompt_id: Optional[str] = None
    ) -> Dict:
        """
        Add a log entry and maintain max_logs limit per room using aggregation pipeline
        
        Args:
            room_id: The room/session ID
            message: The log message content
            log_type: Type of log (system, player-roll, dm-roll, etc.)
            player_name: Name of the player (optional)
            max_logs: Maximum number of logs to keep per room (default: 100)
            prompt_id: Unique prompt ID for linking (optional)
            
        Returns:
            Dict: The inserted log document
        """
        
        # Generate sequential log ID for ordering
        log_id = int(time.time() * 1000000)  # Microsecond precision for better ordering
        
        # Create new log entry
        new_log = {
            "room_id": room_id,
            "message": message,
            "type": log_type,
            "timestamp": datetime.utcnow(),
            "player_name": player_name,
            "log_id": log_id
        }
        
        # Add prompt_id if provided
        if prompt_id:
            new_log["prompt_id"] = prompt_id
        
        try:
            # Insert the new log entry
            result = self.adventure_logs.insert_one(new_log)
            new_log["_id"] = result.inserted_id
            
            # Use aggregation pipeline to efficiently maintain log limit
            self._cleanup_old_logs_pipeline(room_id, max_logs)
            
            return new_log
            
        except Exception as e:
            print(f"Error adding log entry: {e}")
            raise
    
    def _cleanup_old_logs_pipeline(self, room_id: str, max_logs: int):
        """
        Use aggregation pipeline to efficiently clean up old logs for a room
        
        This is more efficient than the count + delete approach because:
        1. Single database operation
        2. Uses indexes effectively
        3. Atomic operation
        """
        
        try:
            # Aggregation pipeline to find logs to keep
            pipeline = [
                # Stage 1: Match logs for this room only
                {
                    "$match": {
                        "room_id": room_id
                    }
                },
                # Stage 2: Sort by log_id descending (newest first)
                {
                    "$sort": {
                        "log_id": -1
                    }
                },
                # Stage 3: Limit to max_logs (keep only newest entries)
                {
                    "$limit": max_logs
                },
                # Stage 4: Group and collect IDs of logs to keep
                {
                    "$group": {
                        "_id": None,
                        "keep_ids": {
                            "$push": "$_id"
                        },
                        "count": {
                            "$sum": 1
                        }
                    }
                }
            ]
            
            # Execute aggregation
            result = list(self.adventure_logs.aggregate(pipeline))
            
            if result and len(result) > 0:
                keep_ids = result[0]["keep_ids"]
                kept_count = result[0]["count"]
                
                # Only delete if we have more than max_logs
                if kept_count == max_logs:
                    # Delete all logs for this room that aren't in the keep list
                    delete_result = self.adventure_logs.delete_many({
                        "room_id": room_id,
                        "_id": {"$nin": keep_ids}
                    })
                    
                    if delete_result.deleted_count > 0:
                        print(f"Cleaned up {delete_result.deleted_count} old logs for room {room_id}")
            
        except Exception as e:
            print(f"Error during log cleanup for room {room_id}: {e}")
            # Don't raise here - log cleanup failure shouldn't break log insertion
    
    def get_room_logs(
        self, 
        room_id: str, 
        limit: int = 50, 
        skip: int = 0
    ) -> List[Dict]:
        """
        Get recent logs for a room with pagination
        
        Args:
            room_id: The room ID to get logs for
            limit: Maximum number of logs to return
            skip: Number of logs to skip (for pagination)
            
        Returns:
            List of log documents, newest first
        """
        
        try:
            logs = list(
                self.adventure_logs.find(
                    {"room_id": room_id},
                    {"_id": 0}  # Exclude MongoDB _id from results
                ).sort("log_id", -1)  # Newest first
                .skip(skip)
                .limit(limit)
            )
            
            return logs
            
        except Exception as e:
            print(f"Error retrieving logs for room {room_id}: {e}")
            return []
    
    def get_room_log_count(self, room_id: str) -> int:
        """Get total number of logs for a room"""
        try:
            return self.adventure_logs.count_documents({"room_id": room_id})
        except Exception as e:
            print(f"Error counting logs for room {room_id}: {e}")
            return 0
    
    def delete_room_logs(self, room_id: str) -> int:
        """
        Delete all logs for a room (useful when room is deleted)
        
        Returns:
            Number of logs deleted
        """
        try:
            result = self.adventure_logs.delete_many({"room_id": room_id})
            print(f"Deleted {result.deleted_count} logs for room {room_id}")
            return result.deleted_count
        except Exception as e:
            print(f"Error deleting logs for room {room_id}: {e}")
            return 0
    
    def bulk_cleanup_all_rooms(self, max_logs: int = 200):
        """
        Perform cleanup for all rooms (useful for maintenance)
        Uses aggregation to efficiently process all rooms
        """
        
        try:
            # Get all unique room IDs
            room_ids = self.adventure_logs.distinct("room_id")
            
            print(f"Starting bulk cleanup for {len(room_ids)} rooms...")
            
            total_cleaned = 0
            for room_id in room_ids:
                initial_count = self.get_room_log_count(room_id)
                self._cleanup_old_logs_pipeline(room_id, max_logs)
                final_count = self.get_room_log_count(room_id)
                
                cleaned = initial_count - final_count
                if cleaned > 0:
                    total_cleaned += cleaned
            
            print(f"Bulk cleanup completed. Total logs cleaned: {total_cleaned}")
            
        except Exception as e:
            print(f"Error during bulk cleanup: {e}")
    
    def get_room_stats(self, room_id: str) -> Dict:
        """Get statistics for a room's logs"""
        
        try:
            # Use aggregation to get comprehensive stats
            pipeline = [
                {"$match": {"room_id": room_id}},
                {
                    "$group": {
                        "_id": None,
                        "total_logs": {"$sum": 1},
                        "types": {"$addToSet": "$type"},
                        "players": {"$addToSet": "$player_name"},
                        "oldest_log": {"$min": "$timestamp"},
                        "newest_log": {"$max": "$timestamp"}
                    }
                }
            ]
            
            result = list(self.adventure_logs.aggregate(pipeline))
            
            if result:
                stats = result[0]
                # Remove None from players list
                stats["players"] = [p for p in stats["players"] if p is not None]
                return stats
            else:
                return {
                    "total_logs": 0,
                    "types": [],
                    "players": [],
                    "oldest_log": None,
                    "newest_log": None
                }
                
        except Exception as e:
            print(f"Error getting stats for room {room_id}: {e}")
            return {}
