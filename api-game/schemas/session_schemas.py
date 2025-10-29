# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from pydantic import BaseModel


class SessionStartRequest(BaseModel):
    """Request to create a new game session in MongoDB"""
    game_id: str
    dm_username: str
    max_players: int = 8


class SessionStartResponse(BaseModel):
    """Response after creating a game session"""
    success: bool
    session_id: str
    message: str


class SessionEndRequest(BaseModel):
    """Request to end a game session"""
    game_id: str


class SessionEndResponse(BaseModel):
    """Response with final game state"""
    success: bool
    final_state: dict
    message: str = ""
