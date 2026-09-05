# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import logging
from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase
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

    Every database call in api-game is awaited (PyMongo's async client, which
    replaced the blocking driver — see .claude/plans/api-game/). A blocking
    call in a handler would stall the single event loop that serves every
    client in every room, so there is deliberately no sync client here.
    """

    def __init__(self):
        self._username = CONFIG.get('MONGO_USER')
        self._password = CONFIG.get('MONGO_PASS')
        self._db_name = CONFIG.get('MONGO_DB_NAME')
        self._client = None

    @property
    def client(self) -> AsyncMongoClient:
        """
        The connection pool is built on first use,
        reused for the process' lifetime.

        AsyncMongoClient connects lazily — constructing it proves nothing
        about MongoDB being reachable, and it never blocks. Reachability is
        established by the awaited ping in app.py's lifespan, which is the
        only place that can fail the boot.
        """
        if self._client is None:
            self._client = AsyncMongoClient(
                'mongodb://mongo',
                username=self._username,
                password=self._password,
                serverSelectionTimeoutMS=5000,
            )
        return self._client

    @property
    def db(self) -> AsyncDatabase:
        """Returns a database connection for consumers"""
        return self.client[self._db_name]

    async def verify_connection(self) -> None:
        """Force a real round-trip so an unreachable MongoDB fails the boot
        rather than surfacing as a stalled request later.

        Raises:
            ServerSelectionTimeoutError: MongoDB did not answer the ping
                within serverSelectionTimeoutMS. Deliberately unhandled — the
                service cannot serve a game without its hot store, so the
                lifespan lets it propagate and the container dies loudly.
                Do not wrap this in a retry.
        """
        try:
            await self.client.admin.command('ping')
        except ServerSelectionTimeoutError:
            logger.critical("MongoDB unreachable — refusing to start")
            raise
        logger.info("MongoDB connection established")

    async def close(self) -> None:
        """Release the pool at shutdown (lifespan teardown).

        The reference is dropped BEFORE the await, so a failed close still
        leaves this service able to build a fresh client. That matters because
        AsyncMongoClient binds to the event loop that created it and raises
        RuntimeError if closed from a different one — which is exactly what
        happens in tests, where each test gets its own loop.
        """
        if self._client is None:
            return
        client, self._client = self._client, None
        await client.close()


mongo_service = _MongoService()
