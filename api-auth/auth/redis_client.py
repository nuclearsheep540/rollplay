# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import redis
import logging
from typing import Optional

logger = logging.getLogger(__name__)

class RedisClient:
    """
    Redis client for storing short codes mapped to JWT tokens
    """
    
    def __init__(self, redis_url: str):
        self.redis_url = redis_url
        self.redis_client = None
        self._connect()
    
    def _connect(self):
        """Connect to Redis"""
        try:
            self.redis_client = redis.from_url(self.redis_url, decode_responses=True)
            # Test connection
            self.redis_client.ping()
            logger.info(f"Connected to Redis at {self.redis_url}")
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {str(e)}")
            # Fall back to in-memory dictionary for development
            self.redis_client = None
            self._fallback_storage = {}
            logger.warning("Using in-memory storage fallback instead of Redis")
    
    def set_short_code(self, short_code: str, jwt_token: str, expire_minutes: int = 15) -> bool:
        """
        Store short code mapped to JWT token with expiration
        """
        try:
            if self.redis_client:
                # Store in Redis with expiration
                expire_seconds = expire_minutes * 60
                result = self.redis_client.setex(
                    f"short_code:{short_code}", 
                    expire_seconds, 
                    jwt_token
                )
                logger.info(f"Stored short code {short_code} in Redis with {expire_minutes}min expiration")
                return result
            else:
                # Fallback to in-memory storage
                self._fallback_storage[short_code] = jwt_token
                logger.info(f"Stored short code {short_code} in memory fallback")
                return True
                
        except Exception as e:
            logger.error(f"Error storing short code {short_code}: {str(e)}")
            return False
    
    def get_jwt_from_short_code(self, short_code: str) -> Optional[str]:
        """
        Retrieve JWT token from short code
        """
        try:
            if self.redis_client:
                # Get from Redis
                jwt_token = self.redis_client.get(f"short_code:{short_code}")
                if jwt_token:
                    logger.info(f"Retrieved JWT for short code {short_code} from Redis")
                    return jwt_token
                else:
                    logger.info(f"Short code {short_code} not found or expired in Redis")
                    return None
            else:
                # Fallback to in-memory storage
                jwt_token = self._fallback_storage.get(short_code)
                if jwt_token:
                    logger.info(f"Retrieved JWT for short code {short_code} from memory fallback")
                    return jwt_token
                else:
                    logger.info(f"Short code {short_code} not found in memory fallback")
                    return None
                    
        except Exception as e:
            logger.error(f"Error retrieving JWT for short code {short_code}: {str(e)}")
            return None
    
    def delete_short_code(self, short_code: str) -> bool:
        """
        Delete short code from storage (for one-time use)
        """
        try:
            if self.redis_client:
                # Delete from Redis
                result = self.redis_client.delete(f"short_code:{short_code}")
                logger.info(f"Deleted short code {short_code} from Redis")
                return bool(result)
            else:
                # Delete from in-memory storage
                if short_code in self._fallback_storage:
                    del self._fallback_storage[short_code]
                    logger.info(f"Deleted short code {short_code} from memory fallback")
                    return True
                return False
                
        except Exception as e:
            logger.error(f"Error deleting short code {short_code}: {str(e)}")
            return False
    
    def health_check(self) -> bool:
        """
        Check Redis connection health
        """
        try:
            if self.redis_client:
                self.redis_client.ping()
                return True
            else:
                # Fallback storage is always "healthy"
                return True
        except Exception as e:
            logger.error(f"Redis health check failed: {str(e)}")
            return False