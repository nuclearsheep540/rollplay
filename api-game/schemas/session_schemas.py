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
    """Request to end a game and return its final state.

    game_id is the room id: api-site keys the game and the room by one
    identifier, so there is nothing else to address it by.
    """
    game_id: str
