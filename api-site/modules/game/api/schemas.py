# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from modules.game.domain.game_aggregate import MAX_GAME_NAME_LENGTH


class AttendeeResponse(BaseModel):
    """One person who was at the table during a game."""

    user_id: UUID
    character_id: Optional[UUID] = None

    class Config:
        from_attributes = True


class GameResponse(BaseModel):
    """A game on the wire.

    Deliberately carries NO play state: the boards, log, screen and audio a game
    ended with exist so the next game can seed from them, which happens
    server-side. Nothing in the browser needs them, and shipping them would put
    a whole session's history into every dashboard load.
    """

    id: UUID
    session_id: UUID
    campaign_id: UUID
    host_id: UUID
    status: str  # starting | active | ending | ended
    name: Optional[str] = None  # null → the client renders "Game {n}"
    created_at: datetime
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    ended_by: Optional[str] = None  # host | system | null
    summary: Optional[str] = None
    attendance: List[AttendeeResponse] = []

    class Config:
        from_attributes = True


class StartGameRequest(BaseModel):
    """Start the session's game. The name comes from the session's plan, not from here."""

    session_id: UUID


class EndGameRequest(BaseModel):
    """The GM's record of the night, offered as the game ends.

    Both optional and never blocking: a GM who just wants the game to stop
    sends neither. None leaves what the game already had; an empty string clears it.
    """

    name: Optional[str] = Field(None, max_length=MAX_GAME_NAME_LENGTH)
    summary: Optional[str] = None


class UpdateGameRequest(BaseModel):
    """Edit a game's record after the fact. Same None/empty distinction as EndGameRequest."""

    name: Optional[str] = Field(None, max_length=MAX_GAME_NAME_LENGTH)
    summary: Optional[str] = None


class DisconnectRequest(BaseModel):
    """A player's runtime state, sent by api-game when their socket closes.

    user_id travels in the body because this route is service-to-service: there
    is no browser session to read it from.
    """

    user_id: UUID
    character_id: UUID
    character_state: dict
