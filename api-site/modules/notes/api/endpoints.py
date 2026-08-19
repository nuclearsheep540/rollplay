# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import logging
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from modules.campaign.dependencies.providers import campaign_repository
from modules.campaign.repositories.campaign_repository import CampaignRepository
from modules.notes.application.commands import (
    CreateNote,
    DeleteNote,
    NoteLimitReached,
    RenameNote,
    UpdateNoteContent,
)
from modules.notes.application.queries import GetNoteById, GetNotesForCampaign
from modules.notes.domain.note_aggregate import NoteAggregate, NoteRevisionConflict
from modules.notes.dependencies.providers import get_note_repository
from modules.notes.repositories.note_repository import NoteRepository
from shared.dependencies.auth import get_current_user_id

from .schemas import (
    CreateNoteRequest,
    NoteResponse,
    NoteSummaryResponse,
    RenameNoteRequest,
    UpdateNoteContentRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["notes"])


def _to_note_response(note: NoteAggregate) -> NoteResponse:
    """Enrichment, not plain mapping: `title` is the derived display title."""
    return NoteResponse(
        id=note.id,
        campaign_id=note.campaign_id,
        campaign_name=note.campaign_name,
        title=note.display_title,
        content_delta=note.content_delta,
        rev=note.rev,
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


def _to_note_summary(note: NoteAggregate) -> NoteSummaryResponse:
    return NoteSummaryResponse(
        id=note.id,
        title=note.display_title,
        campaign_id=note.campaign_id,
        campaign_name=note.campaign_name,
        rev=note.rev,
        updated_at=note.updated_at,
    )


@router.get("", response_model=List[NoteSummaryResponse])
async def list_notes(
    campaign_id: UUID = Query(...),
    user_id: UUID = Depends(get_current_user_id),
    note_repo: NoteRepository = Depends(get_note_repository),
):
    """
    This user's notes for one campaign, newest first.

    Returns an empty list when there are none — it never creates a first note.
    Note creation is always an explicit user action.
    """
    query = GetNotesForCampaign(note_repo)
    notes = query.execute(user_id, campaign_id)
    return [_to_note_summary(note) for note in notes]


@router.post("", response_model=NoteResponse, status_code=status.HTTP_201_CREATED)
async def create_note(
    request: CreateNoteRequest,
    user_id: UUID = Depends(get_current_user_id),
    note_repo: NoteRepository = Depends(get_note_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
):
    """Start a new empty note against a campaign the user belongs to."""
    command = CreateNote(note_repo, campaign_repo)
    try:
        note = command.execute(user_id, request.campaign_id)
    except NoteLimitReached as limit_error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(limit_error)
        )
    except PermissionError as permission_error:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(permission_error))
    except ValueError as value_error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(value_error))

    return _to_note_response(note)


@router.get("/{note_id}", response_model=NoteResponse)
async def get_note(
    note_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    note_repo: NoteRepository = Depends(get_note_repository),
):
    """One note in full, including its document body."""
    query = GetNoteById(note_repo)
    try:
        note = query.execute(note_id, user_id)
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")

    return _to_note_response(note)


@router.put("/{note_id}", response_model=NoteResponse)
async def update_note_content(
    note_id: UUID,
    request: UpdateNoteContentRequest,
    user_id: UUID = Depends(get_current_user_id),
    note_repo: NoteRepository = Depends(get_note_repository),
):
    """
    Save a whole document. This is the autosave endpoint.

    A stale `rev` answers 409 so the client can tell the user their note was edited
    elsewhere, rather than one tab silently overwriting another.
    """
    command = UpdateNoteContent(note_repo)
    try:
        note = command.execute(
            note_id, user_id, request.content_delta, request.content_text, request.rev
        )
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    except NoteRevisionConflict as conflict:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(conflict))
    except ValueError as value_error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(value_error))

    return _to_note_response(note)


@router.patch("/{note_id}", response_model=NoteResponse)
async def rename_note(
    note_id: UUID,
    request: RenameNoteRequest,
    user_id: UUID = Depends(get_current_user_id),
    note_repo: NoteRepository = Depends(get_note_repository),
):
    """Set an explicit title, or send an empty one to revert to a derived title."""
    command = RenameNote(note_repo)
    try:
        note = command.execute(note_id, user_id, request.title)
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    except ValueError as value_error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(value_error))

    return _to_note_response(note)


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    note_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    note_repo: NoteRepository = Depends(get_note_repository),
):
    """Permanently remove a note."""
    command = DeleteNote(note_repo)
    try:
        command.execute(note_id, user_id)
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
