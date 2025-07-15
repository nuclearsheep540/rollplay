# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import os
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import logging
from config.settings import Settings
from s3_service import s3_site_service
from auth_middleware import get_authenticated_service

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

# S3 Asset Management Endpoints (Authenticated)
@app.get("/s3/assets")
async def list_site_assets(
    asset_type: str = None,
    service: str = Depends(get_authenticated_service)
):
    """List all site assets from S3 bucket (authenticated)"""
    try:
        assets = s3_site_service.list_site_assets(asset_type)
        return assets
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/s3/assets/with-urls")
async def get_assets_with_urls(
    asset_type: str = None,
    service: str = Depends(get_authenticated_service)
):
    """Get all site assets with presigned URLs (authenticated)"""
    try:
        assets = s3_site_service.get_assets_with_presigned_urls(asset_type)
        return assets
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/s3/assets/{object_key}")
async def get_asset_with_url(
    object_key: str,
    service: str = Depends(get_authenticated_service)
):
    """Get a specific asset with presigned URL (authenticated)"""
    try:
        asset = s3_site_service.get_asset_with_presigned_url(object_key)
        if not asset:
            raise HTTPException(status_code=404, detail=f"Asset {object_key} not found")
        return asset
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/s3/assets/{object_key}/url")
async def get_presigned_url(
    object_key: str, 
    expiry: int = None,
    service: str = Depends(get_authenticated_service)
):
    """Generate a presigned URL for a specific asset (authenticated)"""
    try:
        url = s3_site_service.generate_presigned_url(object_key, expiry)
        if not url:
            raise HTTPException(status_code=404, detail=f"Asset {object_key} not found")
        return {"presigned_url": url, "expires_in": expiry or s3_site_service.presigned_url_expiry}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/s3/health")
async def check_s3_health(service: str = Depends(get_authenticated_service)):
    """Check S3 bucket access and configuration (authenticated)"""
    try:
        health = s3_site_service.check_bucket_access()
        return health
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8082)