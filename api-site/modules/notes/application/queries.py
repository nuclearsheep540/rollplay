# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List
from uuid import UUID

from modules.notes.domain.note_aggregate import NoteAggregate
from modules.notes.repositories.note_repository import NoteRepository


class GetNotesForCampaign:
    """This user's notes for one campaign, most recently edited first."""

    def __init__(self, note_repository: NoteRepository):
        self.note_repo = note_repository

    def execute(self, user_id: UUID, campaign_id: UUID) -> List[NoteAggregate]:
        return self.note_repo.list_for_campaign(user_id, campaign_id)


class GetNoteById:
    """
    One note in full, if it belongs to this user.

    A note owned by someone else is reported as missing rather than forbidden —
    the existence of another user's note is not ours to confirm.
    """

    def __init__(self, note_repository: NoteRepository):
        self.note_repo = note_repository

    def execute(self, note_id: UUID, user_id: UUID) -> NoteAggregate:
        note = self.note_repo.get_by_id(note_id)
        if not note or not note.is_owned_by(user_id):
            raise LookupError("Note not found")

        return note
