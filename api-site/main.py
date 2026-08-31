# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
import logging
import logging.config
from config.settings import Settings
from shared.dependencies.db import configure_mappers
from shared.error_handlers import validation_exception_handler
from shared.rulesets.registry import RulesetRegistry

# Initialize Sentry for monitoring and security alerts
from config.sentry_config import init_sentry
init_sentry()

# Import aggregate routers directly
from modules.user.api.endpoints import router as user_router
from modules.campaign.api.endpoints import router as campaign_router
from modules.characters.api.endpoints import router as characters_router
from modules.characters.api.edition_endpoints import router as editions_router
from modules.session.api.endpoints import router as session_router
from modules.friendship.api.endpoints import router as friendship_router
from modules.events.api.notification_endpoints import router as notification_router
from modules.library.api.endpoints import router as library_router
from modules.notes.api.endpoints import router as notes_router
from modules.news.api.endpoints import router as news_router
from modules.stream.api.endpoints import router as stream_router

# Import integration routers (external-service ACLs, not core aggregates)
from integrations.spotify.endpoints import router as spotify_router

# Import WebSocket endpoint
from modules.events.api.websocket_endpoint import websocket_events_endpoint

# Background task: auto-pauses sessions whose signed-URL lease has lapsed
from modules.session.application.expired_session_cleanup import run_expired_session_cleanup

# Configure logging from settings
settings = Settings()
logging.config.dictConfig(settings.LOGGING_CONFIG)
logger = logging.getLogger(__name__)

# Configure SQLAlchemy mappers early
configure_mappers()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load ruleset reference data from JSON into the in-memory registry.
    # Boot fails if any seed file is missing or fails validation.
    RulesetRegistry.initialize()

    # Expired-session cleanup — stateless loop; deadlines live in PostgreSQL,
    # so restarts lose nothing and the first pass catches anything past due.
    cleanup_stop = asyncio.Event()
    cleanup_task = asyncio.create_task(run_expired_session_cleanup(cleanup_stop))

    yield

    cleanup_stop.set()
    await cleanup_task


# Create FastAPI app
app = FastAPI(
    title="Rollplay Site API",
    description="Site-wide API for Tabletop Tavern - handles landing page, user management, and core site functionality",
    version="1.0.0",
    lifespan=lifespan,
)

# Register custom exception handlers
app.add_exception_handler(RequestValidationError, validation_exception_handler)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include aggregate routers
app.include_router(user_router, prefix="/api/users")
app.include_router(campaign_router, prefix="/api/campaigns")
app.include_router(characters_router, prefix="/api/characters")
app.include_router(editions_router, prefix="/api/editions", tags=["editions"])
app.include_router(session_router, prefix="/api/sessions")
app.include_router(friendship_router, prefix="/api/friendships")
app.include_router(notification_router, prefix="/api/notifications")
app.include_router(library_router, prefix="/api/library", tags=["library"])
app.include_router(notes_router, prefix="/api/notes", tags=["notes"])
app.include_router(news_router, prefix="/api/news", tags=["news"])
app.include_router(stream_router, prefix="/api/stream", tags=["stream"])
app.include_router(spotify_router, prefix="/api/spotify", tags=["spotify"])

# Register WebSocket endpoint
app.add_websocket_route("/ws/events", websocket_events_endpoint)

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint for load balancer"""
    return {
        "status": "healthy",
        "service": "api-site",
        "version": "1.0.0"
    }

# Root endpoint
@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "Rollplay Site API",
        "version": "1.0.0",
        "description": "Site-wide API for Tabletop Tavern"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8082)