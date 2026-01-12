# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
import logging
import logging.config
from shared.config import Settings
from shared.dependencies.db import configure_mappers
from shared.error_handlers import validation_exception_handler

# Initialize Sentry for monitoring and security alerts
from sentry_config import init_sentry
init_sentry()

# Import aggregate routers directly
from modules.user.api.endpoints import router as user_router
from modules.campaign.api.endpoints import router as campaign_router
from modules.characters.api.endpoints import router as characters_router
from modules.game.api.endpoints import router as game_router
from modules.friendship.api.endpoints import router as friendship_router
from modules.events.api.notification_endpoints import router as notification_router

# Import WebSocket endpoint
from modules.events.api.websocket_endpoint import websocket_events_endpoint

# Configure logging from settings
settings = Settings()
logging.config.dictConfig(settings.LOGGING_CONFIG)
logger = logging.getLogger(__name__)

# Configure SQLAlchemy mappers early
configure_mappers()

# Create FastAPI app
app = FastAPI(
    title="Rollplay Site API",
    description="Site-wide API for Tabletop Tavern - handles landing page, user management, and core site functionality",
    version="1.0.0"
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
app.include_router(game_router, prefix="/api/games")
app.include_router(friendship_router, prefix="/api/friends")
app.include_router(notification_router, prefix="/api/notifications")

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