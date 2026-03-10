# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Local session schemas for api-game.

Boundary schemas (SessionStartPayload, SessionEndResponse, etc.) live in
the shared_contracts package. This module retains only api-game-local
request models that have no cross-service meaning.
"""

from pydantic import BaseModel


class SessionEndRequest(BaseModel):
    """Request to end a game and return final state for session."""
    session_id: str
