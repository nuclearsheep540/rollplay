# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import FastAPI

from user.api.endpoints import router as user_router
from campaign.api.endpoints import router as campaign_router
# Additional routers can be imported here as modules are added

def include_aggregate_routers(app: FastAPI):
    """
    Maps routers from each aggregate module.
    
    This centralizes all aggregate router inclusions following the 
    Aggregate-Centric Modules pattern.
    
    Args:
        app: FastAPI application instance
    """
    # DDD Aggregate routers
    app.include_router(user_router, prefix="/api")
    app.include_router(campaign_router, prefix="/api")
    
    # Note: Legacy migration router moved to legacy/ directory
    # Hot/cold migration functionality now available through Campaign API:
    # POST /api/campaigns/games/{game_id}/start
    # POST /api/campaigns/games/{game_id}/end