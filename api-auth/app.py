# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import os
import logging
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from auth.passwordless import PasswordlessAuth
from auth.jwt_handler import JWTHandler
from models.user import User, UserCreate, UserResponse
from models.session import LoginRequest, LoginResponse, ValidateRequest, ValidateResponse
from config.settings import Settings

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize settings
settings = Settings()

# Create FastAPI app
app = FastAPI(
    title="Rollplay Auth API",
    description="Authentication service for Tabletop Tavern - handles passwordless login, JWT validation, and user management",
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

# Initialize auth services
passwordless_auth = PasswordlessAuth(settings)
jwt_handler = JWTHandler(settings)

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint for load balancer"""
    return {
        "status": "healthy",
        "service": "api-auth",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat()
    }

# Authentication endpoints
@app.post("/auth/magic-link")
async def magic_link_request(request: LoginRequest):
    """
    Send magic link to user's email for passwordless authentication
    """
    try:
        result = await passwordless_auth.send_magic_link(request.email)
        
        if result["success"]:
            logger.info(f"Magic link sent successfully to {request.email}")
            logger.info(f"SMTP Response Details: {result.get('email_response', {}).get('smtp_response', 'No SMTP details')}")
            
            return {
                "success": True,
                "message": "Magic link sent to your email",
                "email": request.email,
                "smtp_details": result.get("email_response", {}).get("smtp_response", {})
            }
        else:
            logger.error(f"Failed to send magic link to {request.email}: {result.get('message', 'Unknown error')}")
            raise HTTPException(
                status_code=500, 
                detail={
                    "message": "Failed to send magic link",
                    "details": result.get("email_response", {}),
                    "error": result.get("error", "Unknown error")
                }
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error sending magic link to {request.email}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to send magic link")

@app.post("/auth/login-request", response_model=LoginResponse)
async def login_request(request: LoginRequest):
    """
    Initiate passwordless login by sending magic link to user's email
    """
    try:
        magic_link = await passwordless_auth.send_magic_link(request.email)
        
        logger.info(f"Magic link sent to {request.email}")
        
        return LoginResponse(
            success=True,
            message="Magic link sent to your email",
            email=request.email
        )
        
    except Exception as e:
        logger.error(f"Error sending magic link to {request.email}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to send magic link")

@app.get("/auth/verify/{token}")
async def verify_magic_link(token: str):
    """
    Verify magic link token and return JWT
    """
    try:
        auth_result = await passwordless_auth.verify_magic_link(token)
        
        if not auth_result:
            raise HTTPException(status_code=400, detail="Invalid or expired magic link")
        
        logger.info(f"Successfully authenticated user: {auth_result['user']['email']}")
        
        return {
            "success": True,
            "access_token": auth_result["access_token"],
            "token_type": auth_result["token_type"],
            "user": auth_result["user"],
            "message": "Successfully authenticated"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verifying magic link: {str(e)}")
        raise HTTPException(status_code=500, detail="Authentication failed")

@app.post("/auth/verify-otp")
async def verify_otp_token(request: ValidateRequest):
    """
    Verify OTP token manually typed by the user
    """
    try:
        auth_result = await passwordless_auth.verify_otp_token(request.token)
        
        if not auth_result:
            raise HTTPException(status_code=400, detail="Invalid or expired OTP token")
        
        logger.info(f"Successfully authenticated user via OTP: {auth_result['user']['email']}")
        
        return {
            "success": True,
            "access_token": auth_result["access_token"],
            "token_type": auth_result["token_type"],
            "user": auth_result["user"],
            "message": "Successfully authenticated via OTP"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verifying OTP token: {str(e)}")
        raise HTTPException(status_code=500, detail="OTP authentication failed")

@app.post("/auth/validate", response_model=ValidateResponse)
async def validate_token(request: ValidateRequest):
    """
    Validate JWT token (used by other services)
    """
    try:
        user_data = jwt_handler.verify_token(request.token)
        
        if not user_data:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        
        return ValidateResponse(
            valid=True,
            user=user_data,
            message="Token is valid"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error validating token: {str(e)}")
        raise HTTPException(status_code=500, detail="Token validation failed")

@app.post("/auth/logout")
async def logout(token: str = Depends(jwt_handler.get_token_from_header)):
    """
    Logout user by invalidating token
    """
    try:
        # In a production system, you'd add the token to a blacklist
        # For now, just return success
        logger.info("User logged out successfully")
        
        return {
            "success": True,
            "message": "Logged out successfully"
        }
        
    except Exception as e:
        logger.error(f"Error during logout: {str(e)}")
        raise HTTPException(status_code=500, detail="Logout failed")

# User management endpoints
@app.get("/auth/profile", response_model=UserResponse)
async def get_profile(current_user: dict = Depends(jwt_handler.get_current_user)):
    """
    Get current user profile
    """
    try:
        return UserResponse(
            id=current_user["id"],
            email=current_user["email"],
            display_name=current_user.get("display_name"),
            created_at=current_user.get("created_at"),
            last_login=current_user.get("last_login")
        )
        
    except Exception as e:
        logger.error(f"Error getting user profile: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get profile")

@app.put("/auth/profile", response_model=UserResponse)
async def update_profile(
    user_update: UserCreate,
    current_user: dict = Depends(jwt_handler.get_current_user)
):
    """
    Update user profile
    """
    try:
        # In a production system, you'd update the database
        # For now, just return the updated user data
        updated_user = {
            **current_user,
            "display_name": user_update.display_name
        }
        
        logger.info(f"Updated profile for user: {current_user['email']}")
        
        return UserResponse(
            id=updated_user["id"],
            email=updated_user["email"],
            display_name=updated_user.get("display_name"),
            created_at=updated_user.get("created_at"),
            last_login=updated_user.get("last_login")
        )
        
    except Exception as e:
        logger.error(f"Error updating profile: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update profile")

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "Rollplay Auth API",
        "version": "1.0.0",
        "description": "Authentication service for Tabletop Tavern"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8083)