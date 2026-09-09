# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

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
    # The campaign's display name, for surfaces that hold a game but not its
    # campaign — the game runtime knows a room id and nothing else. Filled only
    # by the read route, which already loads the campaign for its permission
    # check, so it costs nothing there and stays null everywhere else (the
    # dashboard reads games alongside the campaign they belong to).
    # Spelled campaign_name, matching every other copy of campaign.title.
    campaign_name: Optional[str] = None

    class Config:
        from_attributes = True


class StartGameRequest(BaseModel):
    """Start the session's game. The name comes from the session's plan, not from here."""

    session_id: UUID


class EndGameRequest(BaseModel):
    """The wrap-up: what tonight was, and when the next one is.

    Every field is optional and none of them blocks ending. A GM who just wants
    the game to stop sends an empty body.

    name/summary describe the game being closed. next_scheduled_at and
    next_game_name describe the NEXT one, and travel with the end rather than
    through the schedule route because ending clears the date — setting it in a
    second call would mean the wrap-up could half-succeed, leaving the table
    with no date when the GM had just given them one.
    """

    name: Optional[str] = Field(None, max_length=MAX_GAME_NAME_LENGTH)
    summary: Optional[str] = None
    next_scheduled_at: Optional[datetime] = None
    next_game_name: Optional[str] = Field(None, max_length=MAX_GAME_NAME_LENGTH)

    @field_validator("next_scheduled_at")
    @classmethod
    def must_be_timezone_aware(cls, value: Optional[datetime]) -> Optional[datetime]:
        """Refuse naive datetimes at the boundary — same rule as the schedule route.

        The client sends an instant, not a wall-clock reading: everyone at the
        table is meant to see the same moment in their own zone. A naive value
        would be read as server-local and show the wrong time to everyone but
        the server.
        """
        if value is not None and value.tzinfo is None:
            raise ValueError("next_scheduled_at must include a timezone offset")
        return value


class UpdateGameRequest(BaseModel):
    """Edit a game's record after the fact. Same None/empty distinction as EndGameRequest."""

    name: Optional[str] = Field(None, max_length=MAX_GAME_NAME_LENGTH)
    summary: Optional[str] = None


class DisconnectRequest(BaseModel):
    """Who left, sent by api-game when a socket closes.

    user_id travels in the body because this route is service-to-service: there
    is no browser session to read it from.

    Carries no character state, deliberately. The room's copy of a player's HP
    is older than their character row's, so a state payload here could only
    lose data — see DisconnectFromGame.
    """

    user_id: UUID
    character_id: UUID
