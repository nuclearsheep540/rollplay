# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Custom error handlers for FastAPI application.

Provides transparent logging and user-friendly error responses.
"""

import logging
from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


async def validation_exception_handler(
    request: Request,
    exc: RequestValidationError
) -> JSONResponse:
    """
    Custom handler for Pydantic validation errors (422).

    Benefits:
    1. Logs all validation failures for debugging transparency
    2. Returns user-friendly error messages to frontend
    3. Includes request context (endpoint, method, client IP, user)
    4. Enables monitoring and analytics of validation patterns

    This handler intercepts FastAPI's automatic 422 responses to add
    backend logging while maintaining the same client behavior.
    """

    # Parse validation errors into structured format
    errors = []
    for error in exc.errors():
        # Build field path (e.g., "body.character_class")
        field = ".".join(str(loc) for loc in error['loc'])
        error_type = error['type']
        message = error['msg']

        errors.append({
            'field': field,
            'type': error_type,
            'message': message
        })

    for error in errors:
        logger.warning(error)

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            'detail': 'Validation failed',
            'errors': errors
        }
    )
