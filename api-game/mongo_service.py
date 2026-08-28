# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import logging
from pymongo import MongoClient
from pymongo.database import Database
from pymongo.errors import ServerSelectionTimeoutError

from config.settings import get_settings

logger = logging.getLogger(__name__)
CONFIG = get_settings()


class _MongoService:
    """
    Owns the process-wide MongoDB connection pool.

    Don't import this class outside this module; otherwise you'll
    create multiple connection pools.
    
    Use the mongo_service singleton instead.
    """

    def __init__(self):
        self._username = CONFIG.get('MONGO_USER')
        self._password = CONFIG.get('MONGO_PASS')
        self._db_name = CONFIG.get('MONGO_DB_NAME')
        self._client = None

    @property
    def client(self) -> MongoClient:
        """
        The connection pool is built on first use,
        reused for the process' lifetime.

        Raises:
            ServerSelectionTimeoutError: MongoDB did not answer the ping
                within the serverSelectionTimeoutMS timeout.
        """
        if self._client is None:
            client = MongoClient(
                'mongodb://mongo',
                username=self._username,
                password=self._password,
                serverSelectionTimeoutMS=5000,
            )
            try:
                client.admin.command('ping')
            except ServerSelectionTimeoutError:
                logger.critical("MongoDB unreachable — refusing to start")
                raise
            logger.info("MongoDB connection established")
            self._client = client
        return self._client

    @property
    def db(self) -> Database:
        """Returns a database connection for consumers"""
        return self.client[self._db_name]


mongo_service = _MongoService()
