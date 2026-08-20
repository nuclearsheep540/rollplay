# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from datetime import datetime
from typing import Any, Dict, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class CreateNoteRequest(BaseModel):
    campaign_id: UUID


class UpdateNoteContentRequest(BaseModel):
    """
    A whole-document save. ``rev`` is the revision the client loaded; the server
    refuses the write if it has moved on (409) rather than clobbering the other
    writer.
    """

    content_delta: Dict[str, Any]
    content_text: str = ""
    rev: int = Field(ge=0)


class RenameNoteRequest(BaseModel):
    """An empty or absent title clears the explicit name and reverts to a derived one."""

    title: Optional[str] = None


class NoteSummaryResponse(BaseModel):
    """List-view shape — no document body; this feeds the note picker."""

    id: UUID
    title: str
    campaign_id: Optional[UUID]
    campaign_name: str
    rev: int
    updated_at: datetime


class NoteResponse(BaseModel):
    id: UUID
    campaign_id: Optional[UUID]
    campaign_name: str
    title: str
    content_delta: Dict[str, Any]
    rev: int
    created_at: datetime
    updated_at: datetime
