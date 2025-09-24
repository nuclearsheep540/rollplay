# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
from shared.db import configure_mappers

# Import aggregate routers directly
from user.api.endpoints import router as user_router
from campaign.api.endpoints import router as campaign_router
from characters.api.endpoints import router as characters_router

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configure SQLAlchemy mappers early
configure_mappers()

# Create FastAPI app
app = FastAPI(
    title="Rollplay Site API",
    description="Site-wide API for Tabletop Tavern - handles landing page, user management, and core site functionality",
    version="1.0.0"
)

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