# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import logging
from config.settings import Settings

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize settings
settings = Settings()

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

# Request/Response models

class HealthResponse(BaseModel):
    status: str
    service: str
    version: str

# Health check endpoint
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint for load balancer"""
    return HealthResponse(
        status="healthy",
        service="api-site",
        version="1.0.0"
    )

# Site endpoints (non-game related)

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