# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later
import time
from datetime import datetime, timezone
from typing import List, Dict, Optional
from pymongo.collection import Collection
from pymongo.database import Database
import logging

logger = logging.getLogger()

class AdventureLogService:
    """
    Service for managing adventure logs with per-room limits using MongoDB aggregation pipelines
    """
    
    def __init__(self, db: Database):
        self.adventure_logs: Collection = db.adventure_logs
        self.create_indexes()

    def create_indexes(self):
        """
        Creates indexes for the adventure_logs collection:
        (room_id, log_id desc) for paginated reads and the cleanup
        pipeline, (room_id, timestamp desc) for stat aggregations.
        """
        self.adventure_logs.create_index([("room_id", 1), ("log_id", -1)])
        self.adventure_logs.create_index([("room_id", 1), ("timestamp", -1)])
        logger.info(f"Created indexes for {self.adventure_logs.name} collection")

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
            
            logger.info(f"Deleted {result.deleted_count} system messages for room {room_id}")
            return result.deleted_count
            
        except Exception as e:
            logger.error(f"Error clearing system messages: {e}")
            raise
    
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
            
            logger.info(f"Deleted {result.deleted_count} total messages for room {room_id}")
            return result.deleted_count
            
        except Exception as e:
            logger.error(f"Error clearing all messages: {e}")
            raise
    
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
            
            logger.info(f"Removed log entry with prompt_id {prompt_id} from room {room_id}")
            return result.deleted_count
            
        except Exception as e:
            logger.error(f"Error removing log by prompt_id: {e}")
            raise
    
    def add_log_entry(
        self, 
        room_id: str, 
        message: str, 
        log_type, 
        from_player: Optional[str] = None, 
        max_logs: int = 200,
        prompt_id: Optional[str] = None
    ) -> Dict:
        """
        Add a log entry and maintain max_logs limit per room using aggregation pipeline
        
        Args:
            room_id: The room/session ID
            message: The log message content
            log_type: Type of log (LogType enum or string)
            from_player: Name of the player sending the message (optional)
            max_logs: Maximum number of logs to keep per room (default: 200)
            prompt_id: Unique prompt ID for linking (optional)
            
        Returns:
            Dict: The inserted log document
        """
        
        # Handle LogType enum conversion internally
        log_type_value = log_type.value if hasattr(log_type, 'value') else log_type
        
        # Generate sequential log ID for ordering
        log_id = int(time.time() * 1000000)  # Microsecond precision for better ordering
        
        # Create new log entry
        new_log = {
            "room_id": room_id,
            "message": message,
            "type": log_type_value,
            "timestamp": datetime.utcnow(),
            "from_player": from_player,
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
            logger.error(f"Error adding log entry: {e}")
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
                        logger.info(f"Cleaned up {delete_result.deleted_count} old logs for room {room_id}")
            
        except Exception as e:
            logger.error(f"Error during log cleanup for room {room_id}: {e}")
            # Don't raise here - log cleanup failure shouldn't break log insertion
    
    def restore_room_logs(self, room_id: str, entries: List[Dict]) -> int:
        """
        Bulk re-seed a room's logs from cold storage (session resume ETL).

        Unlike add_log_entry, timestamps and log_ids are PRESERVED — these are
        historical lines, not new ones. Read ordering comes from log_id, so
        insert order is irrelevant.

        Any existing logs for the room are cleared first: the cold copy is the
        single source of truth on resume, so re-seeding must be idempotent.
        Without this, a partial cleanup on the previous pause (the session doc
        is deleted before its logs, and the resume 409-guard only checks the
        session doc) would let restore stack a second copy on orphaned logs.

        Args:
            room_id: The room/session ID
            entries: LogEntry-shaped dicts (timestamp as ISO-8601 string)

        Returns:
            int: Number of entries restored
        """
        if not entries:
            return 0

        self.delete_room_logs(room_id)

        docs = []
        for entry in entries:
            entry_timestamp = entry.get("timestamp")
            if isinstance(entry_timestamp, str) and entry_timestamp:
                parsed = datetime.fromisoformat(entry_timestamp)
                # Stored timestamps are naive UTC (see add_log_entry) — normalize to match
                if parsed.tzinfo is not None:
                    parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
                entry_timestamp = parsed
            doc = {
                "room_id": room_id,
                "message": entry.get("message", ""),
                "type": entry.get("type", "system"),
                "timestamp": entry_timestamp,
                "from_player": entry.get("from_player"),
                "log_id": entry.get("log_id"),
            }
            if entry.get("prompt_id"):
                doc["prompt_id"] = entry["prompt_id"]
            docs.append(doc)

        try:
            self.adventure_logs.insert_many(docs)
            return len(docs)
        except Exception as e:
            logger.error(f"Error restoring logs for room {room_id}: {e}")
            raise

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
            logger.error(f"Error retrieving logs for room {room_id}: {e}")
            return []
    
    def get_room_log_count(self, room_id: str) -> int:
        """Get total number of logs for a room"""
        try:
            return self.adventure_logs.count_documents({"room_id": room_id})
        except Exception as e:
            logger.error(f"Error counting logs for room {room_id}: {e}")
            return 0
    
    def delete_room_logs(self, room_id: str) -> int:
        """
        Delete all logs for a room (useful when room is deleted)
        
        Returns:
            Number of logs deleted
        """
        try:
            result = self.adventure_logs.delete_many({"room_id": room_id})
            logger.info(f"Deleted {result.deleted_count} logs for room {room_id}")
            return result.deleted_count
        except Exception as e:
            logger.error(f"Error deleting logs for room {room_id}: {e}")
            return 0
    
    def bulk_cleanup_all_rooms(self, max_logs: int = 200):
        """
        Perform cleanup for all rooms (useful for maintenance)
        Uses aggregation to efficiently process all rooms
        """
        
        try:
            # Get all unique room IDs
            room_ids = self.adventure_logs.distinct("room_id")
            
            logger.info(f"Starting bulk cleanup for {len(room_ids)} rooms...")
            
            total_cleaned = 0
            for room_id in room_ids:
                initial_count = self.get_room_log_count(room_id)
                self._cleanup_old_logs_pipeline(room_id, max_logs)
                final_count = self.get_room_log_count(room_id)
                
                cleaned = initial_count - final_count
                if cleaned > 0:
                    total_cleaned += cleaned
            
            logger.info(f"Bulk cleanup completed. Total logs cleaned: {total_cleaned}")
            
        except Exception as e:
            logger.error(f"Error during bulk cleanup: {e}")
    
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
                        "players": {"$addToSet": "$from_player"},
                        "oldest_log": {"$min": "$timestamp"},
                        "newest_log": {"$max": "$timestamp"}
                    }
                }
            ]
            
            result = list(self.adventure_logs.aggregate(pipeline))
            
            if result:
                stats = result[0]
                # Remove None from players list
                stats["players"] = [player for player in stats["players"] if player is not None]
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
            logger.error(f"Error getting stats for room {room_id}: {e}")
            return {}
