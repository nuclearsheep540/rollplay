# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import logging
from fastapi import FastAPI, HTTPException, Depends, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Dict
from datetime import datetime

# Initialize Sentry for monitoring and security alerts
from sentry_config import init_sentry
init_sentry()

from auth.passwordless import PasswordlessAuth, UserServiceUnavailable
from auth.jwt_handler import JWTHandler
from models.user import UserCreate, UserResponse
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


def set_auth_cookies(response: Response, tokens: Dict[str, str]) -> None:
    """Set the access + refresh httpOnly cookies from a token pair.

    Takes any dict carrying 'access_token' and 'refresh_token', which is the shape of
    both create_tokens() output and the auth_result the passwordless flows return.

    Each cookie's max-age mirrors its own JWT's exp, so the browser drops a cookie at
    the moment its token stops verifying. Both numbers come from JWTHandler, which
    reads them from Settings — the one place a lifetime is defined.
    """
    response.set_cookie(
        key="auth_token",
        value=tokens["access_token"],
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=jwt_handler.access_token_expire_minutes * 60,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=tokens["refresh_token"],
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=jwt_handler.refresh_token_expire_days * 24 * 60 * 60,
        path="/",
    )


def clear_auth_cookies(response: Response) -> None:
    """Expire both auth cookies, with the same attributes they were set with so the
    browser matches and replaces them."""
    for cookie_name in ("auth_token", "refresh_token"):
        response.set_cookie(
            key=cookie_name,
            value="",
            httponly=True,
            secure=True,
            samesite="lax",
            max_age=0,
            path="/",
        )

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
async def verify_magic_link(token: str, response: Response):
    """
    Verify magic link token and set httpOnly cookie
    """
    try:
        auth_result = await passwordless_auth.verify_magic_link(token)
        
        if not auth_result:
            raise HTTPException(status_code=400, detail="Invalid or expired magic link")
        
        logger.info(f"Successfully authenticated user: {auth_result['user']['email']}")

        set_auth_cookies(response, auth_result)

        return {
            "success": True,
            "user": auth_result["user"],
            "message": "Successfully authenticated"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verifying magic link: {str(e)}")
        raise HTTPException(status_code=500, detail="Authentication failed")

@app.post("/auth/verify-otp")
async def verify_otp_token(request: ValidateRequest, response: Response):
    """
    Verify OTP token manually typed by the user
    """
    try:
        auth_result = await passwordless_auth.verify_otp_token(request.token)
        
        if not auth_result:
            raise HTTPException(status_code=400, detail="Invalid or expired OTP token")
        
        logger.info(f"Successfully authenticated user via OTP: {auth_result['user']['email']}")

        set_auth_cookies(response, auth_result)

        return {
            "success": True,
            "user": auth_result["user"],
            "message": "Successfully authenticated via OTP"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verifying OTP token: {str(e)}")
        raise HTTPException(status_code=500, detail="OTP authentication failed")

@app.post("/auth/validate", response_model=ValidateResponse)
async def validate_token(request: Request):
    """
    Validate JWT token from httpOnly cookie (used by other services and Next.js middleware)
    """
    try:
        # Get token from httpOnly cookie
        token = request.cookies.get("auth_token")
        
        if not token:
            raise HTTPException(status_code=401, detail="No authentication token found")
        
        user_data = jwt_handler.verify_token(token)
        
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


def _refresh_rejected(detail: str) -> JSONResponse:
    """A 401 that also expires both cookies, so a client holding a dead refresh token
    stops presenting it instead of retrying every twelve minutes.

    The cookies are set on the object that is actually returned: anything written to
    FastAPI's injected `response` is discarded when an HTTPException is raised, which
    is why this path returns rather than raises.
    """
    rejected = JSONResponse(status_code=401, content={"detail": detail})
    clear_auth_cookies(rejected)
    return rejected


@app.post("/auth/refresh")
async def refresh_tokens(request: Request, response: Response):
    """
    Exchange the refresh_token cookie for a new access + refresh pair.

    Rotation: a success re-issues BOTH cookies, so the refresh lifetime restarts on
    every use and an active user is never asked to log in again. Tokens travel only as
    httpOnly cookies; the body never carries them.

    401, both cookies cleared: no cookie presented, or the token is expired, invalid,
        or not a refresh token, or the account is no longer active.
    503, cookies kept: api-site could not confirm the account. A transient outage there
        must not log every user out.
    """
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        return _refresh_rejected("No refresh token")

    try:
        auth_result = await passwordless_auth.refresh_tokens(refresh_token)
    except UserServiceUnavailable as error:
        logger.error(f"Refresh could not confirm account with api-site: {error}")
        raise HTTPException(status_code=503, detail="Account service unavailable")

    if not auth_result:
        return _refresh_rejected("Invalid or expired refresh token")

    set_auth_cookies(response, auth_result)

    return {
        "success": True,
        "user": auth_result["user"],
        "message": "Tokens refreshed"
    }


@app.post("/auth/logout")
async def logout(response: Response):
    """
    Logout user by clearing httpOnly cookies
    """
    try:
        clear_auth_cookies(response)

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