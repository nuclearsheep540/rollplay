# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from modules.notes.domain.note_aggregate import NoteAggregate
from modules.notes.model.note_model import Note as NoteModel


class NoteRepository:
    """Repository for the Note aggregate, with inline ORM translation."""

    def __init__(self, db_session: Session):
        self.db = db_session

    def _to_aggregate(self, model: NoteModel) -> NoteAggregate:
        return NoteAggregate.from_persistence(
            id=model.id,
            user_id=model.user_id,
            campaign_id=model.campaign_id,
            campaign_name=model.campaign_name,
            title=model.title,
            content_delta=model.content_delta,
            content_text=model.content_text,
            rev=model.rev,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )

    def save(self, note: NoteAggregate) -> NoteAggregate:
        """Insert a new note or update an existing one, returning the stored state."""
        if note.id:
            model = self.db.query(NoteModel).filter_by(id=note.id).first()
            if not model:
                raise ValueError(f"Note {note.id} not found")
            model.title = note.title
            model.content_delta = note.content_delta
            model.content_text = note.content_text
            model.rev = note.rev
            model.campaign_id = note.campaign_id
        else:
            model = NoteModel(
                user_id=note.user_id,
                campaign_id=note.campaign_id,
                campaign_name=note.campaign_name,
                title=note.title,
                content_delta=note.content_delta,
                content_text=note.content_text,
                rev=note.rev,
            )
            self.db.add(model)

        self.db.commit()
        self.db.refresh(model)
        return self._to_aggregate(model)

    def get_by_id(self, note_id: UUID) -> Optional[NoteAggregate]:
        model = self.db.query(NoteModel).filter_by(id=note_id).first()
        return self._to_aggregate(model) if model else None

    def list_for_campaign(self, user_id: UUID, campaign_id: UUID) -> List[NoteAggregate]:
        """This user's notes for one campaign, most recently edited first."""
        models = (
            self.db.query(NoteModel)
            .filter_by(user_id=user_id, campaign_id=campaign_id)
            .order_by(NoteModel.updated_at.desc())
            .all()
        )
        return [self._to_aggregate(model) for model in models]

    def list_orphaned(self, user_id: UUID) -> List[NoteAggregate]:
        """
        This user's notes whose campaign has been deleted.

        Nothing calls this in v1 — the archived-notes surface is v2 (see the plan,
        §11). It lives here because it is the query that makes ON DELETE SET NULL
        meaningful, and writing it alongside the migration keeps the two honest.
        """
        models = (
            self.db.query(NoteModel)
            .filter(NoteModel.user_id == user_id, NoteModel.campaign_id.is_(None))
            .order_by(NoteModel.updated_at.desc())
            .all()
        )
        return [self._to_aggregate(model) for model in models]

    def count_for_campaign(self, user_id: UUID, campaign_id: UUID) -> int:
        return (
            self.db.query(NoteModel)
            .filter_by(user_id=user_id, campaign_id=campaign_id)
            .count()
        )

    def delete(self, note_id: UUID) -> bool:
        model = self.db.query(NoteModel).filter_by(id=note_id).first()
        if not model:
            return False

        self.db.delete(model)
        self.db.commit()
        return True
