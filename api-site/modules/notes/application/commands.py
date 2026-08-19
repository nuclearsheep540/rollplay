# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import Any, Dict, Optional
from uuid import UUID

from modules.campaign.repositories.campaign_repository import CampaignRepository
from modules.notes.domain.note_aggregate import MAX_NOTES_PER_CAMPAIGN, NoteAggregate
from modules.notes.repositories.note_repository import NoteRepository


class NoteLimitReached(ValueError):
    """Raised when a user already holds the maximum notes for a campaign."""


class CreateNote:
    """
    Start a new, empty note for a campaign.

    The only command that touches the campaign aggregate: it verifies membership
    (you may only start a notebook for a campaign you are actually in) and reads
    the campaign's name to stamp onto the note. Every later operation is a pure
    ownership check — see NoteAggregate's docstring for why.
    """

    def __init__(self, note_repository: NoteRepository, campaign_repository: CampaignRepository):
        self.note_repo = note_repository
        self.campaign_repo = campaign_repository

    def execute(self, user_id: UUID, campaign_id: UUID) -> NoteAggregate:
        campaign = self.campaign_repo.get_by_id(campaign_id)
        if not campaign:
            raise ValueError("Campaign not found")

        if not campaign.is_member(user_id):
            raise PermissionError("You are not a member of this campaign")

        existing = self.note_repo.count_for_campaign(user_id, campaign_id)
        if existing >= MAX_NOTES_PER_CAMPAIGN:
            raise NoteLimitReached(
                f"{MAX_NOTES_PER_CAMPAIGN} note limit reached — delete a note to make room."
            )

        note = NoteAggregate.create(
            user_id=user_id,
            campaign_id=campaign_id,
            # The campaign aggregate calls its display name `title`; the note stores it
            # as `campaign_name` so it never reads as the note's own title.
            campaign_name=campaign.title,
        )
        return self.note_repo.save(note)


class UpdateNoteContent:
    """Replace a note's body. Refuses a stale revision rather than clobbering it."""

    def __init__(self, note_repository: NoteRepository):
        self.note_repo = note_repository

    def execute(
        self,
        note_id: UUID,
        user_id: UUID,
        content_delta: Dict[str, Any],
        content_text: str,
        expected_rev: int,
    ) -> NoteAggregate:
        note = self.note_repo.get_by_id(note_id)
        if not note or not note.is_owned_by(user_id):
            raise LookupError("Note not found")

        note.update_content(content_delta, content_text, expected_rev)
        return self.note_repo.save(note)


class RenameNote:
    """Set or clear a note's explicit title."""

    def __init__(self, note_repository: NoteRepository):
        self.note_repo = note_repository

    def execute(self, note_id: UUID, user_id: UUID, title: Optional[str]) -> NoteAggregate:
        note = self.note_repo.get_by_id(note_id)
        if not note or not note.is_owned_by(user_id):
            raise LookupError("Note not found")

        note.rename(title)
        return self.note_repo.save(note)


class DeleteNote:
    """Permanently remove a note."""

    def __init__(self, note_repository: NoteRepository):
        self.note_repo = note_repository

    def execute(self, note_id: UUID, user_id: UUID) -> bool:
        note = self.note_repo.get_by_id(note_id)
        if not note or not note.is_owned_by(user_id):
            raise LookupError("Note not found")

        return self.note_repo.delete(note_id)
